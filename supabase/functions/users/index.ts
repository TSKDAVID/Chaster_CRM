import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";

const ROLE_RANK: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  member: 1,
};

function getRank(role: string): number {
  return ROLE_RANK[role] ?? 0;
}

/** Safe JSON for logs / API meta (no secrets). */
function serializeAuthAdminError(err: unknown): {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
} {
  if (err == null) return {};
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    return {
      message: typeof o.message === "string" ? o.message : undefined,
      status: typeof o.status === "number" ? o.status : undefined,
      code: typeof o.code === "string" ? o.code : undefined,
      name: typeof o.name === "string" ? o.name : undefined,
    };
  }
  return { message: String(err) };
}

async function updateSaleDisabled(user_id: string, disabled: boolean) {
  return await supabaseAdmin
    .from("sales")
    .update({ disabled: disabled ?? false })
    .eq("user_id", user_id);
}

async function updateSaleRole(user_id: string, role: string) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ role })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

async function createSale(
  user_id: string,
  data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    disabled: boolean;
    role: string;
  },
) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .insert({
      user_id,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      disabled: data.disabled,
      role: data.role,
      // administrator is set by trigger from role
      administrator: data.role !== "member",
    })
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error creating user:", salesError);
    throw salesError ?? new Error("Failed to create sale");
  }
  return sales.at(0);
}

async function updateSaleAvatar(user_id: string, avatar: string) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ avatar })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

async function inviteUser(req: Request, currentUserSale: any) {
  const { email, password, first_name, last_name, disabled, role, administrator } =
    await req.json();

  // Backward compat: if old clients send administrator boolean, map it
  const effectiveRole = role ?? (administrator ? "admin" : "member");

  const callerRank = getRank(currentUserSale.role);

  // Only admins and super_admins can invite
  if (callerRank < 2) {
    return createErrorResponse(401, "Not Authorized");
  }

  // Cannot assign a role higher than your own (admins can assign admin, not super_admin)
  if (getRank(effectiveRole) > callerRank) {
    return createErrorResponse(
      403,
      "You cannot assign a role higher than your own",
    );
  }

  const { data, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    user_metadata: { first_name, last_name },
  });

  let user = data?.user;

  let inviteEmailMeta:
    | {
        attempted: boolean;
        sent?: boolean;
        skippedReason?: string;
        error?: ReturnType<typeof serializeAuthAdminError>;
      }
    | undefined;

  if (!user && userError?.code === "email_exists") {
    const { data, error } = await supabaseAdmin.rpc("get_user_id_by_email", {
      email,
    });

    if (!data || error) {
      console.error(
        `Error inviting user: error=${error ?? "could not fetch users for email"}`,
      );
      return createErrorResponse(500, "Internal Server Error");
    }

    user = data[0];
    try {
      const { data: existingSale, error: salesError } = await supabaseAdmin
        .from("sales")
        .select("*")
        .eq("user_id", user.id);
      if (salesError) {
        return createErrorResponse(salesError.status, salesError.message, {
          code: salesError.code,
        });
      }
      if (existingSale.length > 0) {
        return createErrorResponse(
          400,
          "A sales for this email already exists",
        );
      }

      const sale = await createSale(user.id, {
        email,
        password,
        first_name,
        last_name,
        disabled,
        role: effectiveRole,
      });

      return new Response(
        JSON.stringify({
          data: sale,
          meta: {
            inviteEmail: {
              attempted: false,
              skippedReason: "email_exists_linked_sales",
            },
          },
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    } catch (error) {
      return createErrorResponse(
        (error as any).status ?? 500,
        "Failed to create user",
      );
    }
  } else {
    if (userError) {
      console.error(`Error inviting user: user_error=${userError}`);
      return createErrorResponse(userError.status, userError.message, {
        code: userError.code,
      });
    }
    if (!data?.user) {
      console.error("Error inviting user: undefined user");
      return createErrorResponse(500, "Internal Server Error");
    }

    const hasInitialPassword =
      typeof password === "string" && password.length > 0;

    if (hasInitialPassword) {
      inviteEmailMeta = {
        attempted: false,
        skippedReason: "password_provided",
      };
    } else {
      inviteEmailMeta = { attempted: true };
      const { error: emailError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email);

      if (emailError) {
        inviteEmailMeta.sent = false;
        inviteEmailMeta.error = serializeAuthAdminError(emailError);
        console.error(
          "[users] inviteUserByEmail failed (user still created):",
          JSON.stringify(inviteEmailMeta.error),
        );
      } else {
        inviteEmailMeta.sent = true;
      }
    }
  }

  try {
    await updateSaleDisabled(user.id, disabled);
    const sale = await updateSaleRole(user.id, effectiveRole);

    return new Response(
      JSON.stringify({
        data: sale,
        meta: {
          inviteEmail: inviteEmailMeta ?? {
            attempted: false,
            skippedReason: "not_tracked",
          },
        },
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

async function triggerPasswordRecoveryEmail(email: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[users] auth recover failed:", res.status, text.slice(0, 300));
    return false;
  }
  return true;
}

async function patchUser(req: Request, currentUserSale: any) {
  const {
    sales_id,
    email,
    first_name,
    last_name,
    avatar,
    role,
    administrator,
    disabled,
    new_password,
    send_password_recovery,
  } = await req.json();

  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("id", sales_id)
    .single();

  if (!sale) {
    return createErrorResponse(404, "Not Found");
  }

  const callerRank = getRank(currentUserSale.role);
  const targetRank = getRank(sale.role);
  const isSelf = currentUserSale.id === sale.id;

  // Members can only update their own profile (no role/disabled changes)
  if (callerRank < 2 && !isSelf) {
    return createErrorResponse(401, "Not Authorized");
  }

  // Admins cannot modify super_admins or other admins
  if (!isSelf && callerRank < 3 && targetRank >= callerRank) {
    return createErrorResponse(
      403,
      "You cannot modify a user with equal or higher role",
    );
  }

  if (send_password_recovery === true) {
    if (callerRank !== 3 || isSelf) {
      return createErrorResponse(
        403,
        "Only super admins can send another user's password recovery email",
      );
    }
    const ok = await triggerPasswordRecoveryEmail(sale.email);
    if (!ok) {
      return createErrorResponse(
        500,
        "Could not send password recovery email (check Auth logs / SMTP)",
      );
    }
  }

  const authPatch: {
    email?: string;
    password?: string;
    ban_duration?: string;
    user_metadata?: Record<string, string>;
  } = {};

  if (typeof email === "string" && email.length > 0) {
    authPatch.email = email;
  }
  if (typeof new_password === "string" && new_password.length > 0) {
    if (callerRank !== 3 || isSelf) {
      return createErrorResponse(
        403,
        "Only super admins can set another user's password",
      );
    }
    if (new_password.length < 6) {
      return createErrorResponse(400, "Password must be at least 6 characters");
    }
    authPatch.password = new_password;
  }
  if (typeof disabled === "boolean") {
    authPatch.ban_duration = disabled ? "87600h" : "none";
  }
  const meta: Record<string, string> = {};
  if (typeof first_name === "string") meta.first_name = first_name;
  if (typeof last_name === "string") meta.last_name = last_name;
  if (Object.keys(meta).length > 0) {
    authPatch.user_metadata = meta;
  }

  if (Object.keys(authPatch).length > 0) {
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.updateUserById(sale.user_id, authPatch);

    if (!userData?.user || userError) {
      console.error("Error patching user:", userError);
      return createErrorResponse(500, "Internal Server Error");
    }
  }

  if (avatar) {
    await updateSaleAvatar(sale.user_id, avatar);
  }

  // Only admins+ can update role and disabled status, and not on themselves
  const canManage = callerRank >= 2 && !isSelf;

  if (!canManage) {
    const { data: new_sale } = await supabaseAdmin
      .from("sales")
      .select("*")
      .eq("id", sales_id)
      .single();
    return new Response(
      JSON.stringify({
        data: new_sale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }

  // Determine effective new role
  const effectiveRole = role ?? (administrator !== undefined ? (administrator ? "admin" : "member") : undefined);

  if (effectiveRole) {
    // Cannot promote someone to a rank higher than your own
    if (getRank(effectiveRole) > callerRank) {
      return createErrorResponse(
        403,
        "You cannot assign a role higher than your own",
      );
    }
  }

  try {
    if (typeof disabled === "boolean") {
      await updateSaleDisabled(sale.user_id, disabled);
    }
    const updatedSale = effectiveRole
      ? await updateSaleRole(sale.user_id, effectiveRole)
      : sale;

    // Re-fetch to get synced administrator field
    const { data: finalSale } = await supabaseAdmin
      .from("sales")
      .select("*")
      .eq("id", sales_id)
      .single();

    return new Response(
      JSON.stringify({
        data: finalSale ?? updatedSale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (e: any) {
    // Catch the "last super admin" trigger error
    if (e?.message?.includes("last super admin")) {
      return createErrorResponse(400, "Cannot remove the last super admin");
    }
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        const currentUserSale = await getUserSale(user);
        if (!currentUserSale) {
          return createErrorResponse(401, "Unauthorized");
        }

        if (req.method === "POST") {
          return inviteUser(req, currentUserSale);
        }

        if (req.method === "PATCH") {
          return patchUser(req, currentUserSale);
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
