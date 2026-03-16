import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserProfile } from "../_shared/getUserProfile.ts";

const ROLE_RANK: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  member: 1,
};

function getRank(role: string): number {
  return ROLE_RANK[role] ?? 0;
}

/**
 * Check if the caller is authorized to manage portal users for the given company.
 * Returns the caller's effective rank for hierarchy checks.
 */
function getManagementRank(
  profile: { userType: string; data: any },
  companyId: number,
): number {
  if (profile.userType === "internal") {
    // Internal admins/super_admins can manage any company
    const rank = getRank(profile.data.role);
    if (rank >= 2) return 3; // Internal admins act as super_admin on portal users
    return 0;
  }
  if (
    profile.userType === "portal" &&
    profile.data.company_id === companyId
  ) {
    return getRank(profile.data.role);
  }
  return 0;
}

function canManageCompany(
  profile: { userType: string; data: any },
  companyId: number,
): boolean {
  return getManagementRank(profile, companyId) >= 2;
}

async function invitePortalUser(req: Request, profile: any) {
  const { email, first_name, last_name, company_id, role } = await req.json();

  const callerRank = getManagementRank(profile, company_id);
  if (callerRank < 2) {
    return createErrorResponse(401, "Not Authorized");
  }

  const effectiveRole = role ?? "member";

  // Cannot assign a role >= your own unless you're super_admin
  if (callerRank < 3 && getRank(effectiveRole) >= callerRank) {
    return createErrorResponse(
      403,
      "You cannot assign a role equal to or higher than your own",
    );
  }

  if (!email || !company_id) {
    return createErrorResponse(400, "email and company_id are required");
  }

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("id", company_id)
    .single();

  if (!company) {
    return createErrorResponse(404, "Company not found");
  }

  const { data, error: userError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      user_metadata: {
        first_name: first_name ?? "",
        last_name: last_name ?? "",
        user_type: "portal",
        company_id,
        portal_role: effectiveRole,
      },
    });

  if (userError) {
    if (userError.code === "email_exists") {
      return createErrorResponse(400, "A user with this email already exists");
    }
    console.error("Error creating portal user:", userError);
    return createErrorResponse(
      userError.status ?? 500,
      userError.message,
    );
  }

  if (!data?.user) {
    return createErrorResponse(500, "Failed to create user");
  }

  const { error: emailError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email);

  if (emailError) {
    console.error("Error sending invitation:", emailError);
  }

  const { data: portalUser, error: fetchError } = await supabaseAdmin
    .from("portal_users")
    .select("*")
    .eq("user_id", data.user.id)
    .single();

  if (fetchError || !portalUser) {
    console.error("Error fetching portal user:", fetchError);
    return createErrorResponse(500, "User created but failed to fetch record");
  }

  return new Response(JSON.stringify({ data: portalUser }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function setPortalUserPassword(req: Request, profile: any) {
  const { portal_user_id, password } = await req.json();

  if (!password || password.length < 6) {
    return createErrorResponse(400, "Password must be at least 6 characters");
  }

  const { data: targetUser } = await supabaseAdmin
    .from("portal_users")
    .select("*")
    .eq("id", portal_user_id)
    .single();

  if (!targetUser) {
    return createErrorResponse(404, "Portal user not found");
  }

  if (!canManageCompany(profile, targetUser.company_id)) {
    return createErrorResponse(401, "Not Authorized");
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    targetUser.user_id,
    { password, email_confirm: true },
  );

  if (error) {
    console.error("Error setting password:", error);
    return createErrorResponse(500, error.message);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function patchPortalUser(req: Request, profile: any) {
  const { portal_user_id, first_name, last_name, role, disabled, avatar } =
    await req.json();

  const { data: targetUser } = await supabaseAdmin
    .from("portal_users")
    .select("*")
    .eq("id", portal_user_id)
    .single();

  if (!targetUser) {
    return createErrorResponse(404, "Portal user not found");
  }

  const isSelf =
    profile.userType === "portal" && profile.data.id === targetUser.id;

  const callerRank = getManagementRank(profile, targetUser.company_id);
  const targetRank = getRank(targetUser.role);

  // Must be able to manage the company or be editing self
  if (!isSelf && callerRank < 2) {
    return createErrorResponse(401, "Not Authorized");
  }

  // Cannot modify someone with equal or higher rank (unless super_admin)
  if (!isSelf && callerRank < 3 && targetRank >= callerRank) {
    return createErrorResponse(
      403,
      "You cannot modify a user with equal or higher role",
    );
  }

  // Update auth user metadata
  const updateData: any = {
    user_metadata: {
      first_name: first_name ?? targetUser.first_name,
      last_name: last_name ?? targetUser.last_name,
    },
  };

  if (disabled !== undefined && callerRank >= 2 && !isSelf) {
    updateData.ban_duration = disabled ? "87600h" : "none";
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUser.user_id,
    updateData,
  );

  if (authError) {
    console.error("Error updating auth user:", authError);
    return createErrorResponse(500, "Failed to update user");
  }

  // Update portal_users record
  const updates: any = {};
  if (first_name !== undefined) updates.first_name = first_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (avatar !== undefined) updates.avatar = avatar;

  // Only admins+ can change role and disabled status (not on themselves)
  if (callerRank >= 2 && !isSelf) {
    if (role !== undefined) {
      // Cannot promote to a rank >= your own
      if (callerRank < 3 && getRank(role) >= callerRank) {
        return createErrorResponse(
          403,
          "You cannot assign a role equal to or higher than your own",
        );
      }
      updates.role = role;
    }
    if (disabled !== undefined) updates.disabled = disabled;
  }

  try {
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from("portal_users")
      .update(updates)
      .eq("id", portal_user_id)
      .select("*")
      .single();

    if (updateError || !updatedUser) {
      // Check for last super admin trigger error
      if (updateError?.message?.includes("last super admin")) {
        return createErrorResponse(400, "Cannot remove the last super admin for this company");
      }
      console.error("Error updating portal user:", updateError);
      return createErrorResponse(500, "Failed to update portal user");
    }

    return new Response(JSON.stringify({ data: updatedUser }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    if (e?.message?.includes("last super admin")) {
      return createErrorResponse(400, "Cannot remove the last super admin for this company");
    }
    console.error("Error updating portal user:", e);
    return createErrorResponse(500, "Failed to update portal user");
  }
}

async function deletePortalUser(req: Request, profile: any) {
  const { portal_user_id } = await req.json();

  const { data: targetUser } = await supabaseAdmin
    .from("portal_users")
    .select("*")
    .eq("id", portal_user_id)
    .single();

  if (!targetUser) {
    return createErrorResponse(404, "Portal user not found");
  }

  const callerRank = getManagementRank(profile, targetUser.company_id);
  const targetRank = getRank(targetUser.role);

  if (callerRank < 2) {
    return createErrorResponse(401, "Not Authorized");
  }

  // Cannot delete someone with equal or higher rank
  if (callerRank < 3 && targetRank >= callerRank) {
    return createErrorResponse(
      403,
      "You cannot delete a user with equal or higher role",
    );
  }

  // Cannot delete the last super_admin
  if (targetUser.role === "super_admin") {
    const { count } = await supabaseAdmin
      .from("portal_users")
      .select("id", { count: "exact", head: true })
      .eq("company_id", targetUser.company_id)
      .eq("role", "super_admin");

    if ((count ?? 0) <= 1) {
      return createErrorResponse(400, "Cannot delete the last super admin");
    }
  }

  const { error: deleteError } = await supabaseAdmin
    .from("portal_users")
    .delete()
    .eq("id", portal_user_id);

  if (deleteError) {
    console.error("Error deleting portal user:", deleteError);
    return createErrorResponse(500, "Failed to delete portal user");
  }

  const { error: authError } =
    await supabaseAdmin.auth.admin.deleteUser(targetUser.user_id);

  if (authError) {
    console.error("Error deleting auth user:", authError);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function resendInvite(req: Request, profile: any) {
  const { portal_user_id } = await req.json();

  const { data: targetUser } = await supabaseAdmin
    .from("portal_users")
    .select("*")
    .eq("id", portal_user_id)
    .single();

  if (!targetUser) {
    return createErrorResponse(404, "Portal user not found");
  }

  if (!canManageCompany(profile, targetUser.company_id)) {
    return createErrorResponse(401, "Not Authorized");
  }

  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    targetUser.email,
  );

  if (error) {
    console.error("Error resending invite:", error);
    return createErrorResponse(500, error.message);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        const profile = await getUserProfile(user!);
        if (!profile) {
          return createErrorResponse(401, "Unauthorized");
        }

        if (req.method === "POST") {
          return invitePortalUser(req, profile);
        }

        if (req.method === "PATCH") {
          const url = new URL(req.url);
          if (url.searchParams.get("action") === "set_password") {
            return setPortalUserPassword(req, profile);
          }
          return patchPortalUser(req, profile);
        }

        if (req.method === "DELETE") {
          return deletePortalUser(req, profile);
        }

        if (req.method === "PUT") {
          return resendInvite(req, profile);
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
