import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserProfile } from "../_shared/getUserProfile.ts";

/**
 * Check if the caller is authorized to manage portal users for the given company.
 * Internal admins can manage any company. Portal admins can manage their own company.
 */
function canManageCompany(
  profile: { userType: string; data: any },
  companyId: number,
): boolean {
  if (profile.userType === "internal" && profile.data.administrator) {
    return true;
  }
  if (
    profile.userType === "portal" &&
    profile.data.role === "admin" &&
    profile.data.company_id === companyId
  ) {
    return true;
  }
  return false;
}

async function invitePortalUser(req: Request, profile: any) {
  const { email, first_name, last_name, company_id, role } = await req.json();

  if (!canManageCompany(profile, company_id)) {
    return createErrorResponse(401, "Not Authorized");
  }

  if (!email || !company_id) {
    return createErrorResponse(400, "email and company_id are required");
  }

  // Verify the company exists
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("id", company_id)
    .single();

  if (!company) {
    return createErrorResponse(404, "Company not found");
  }

  // Create auth user with portal metadata
  const { data, error: userError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(), // temporary password, user will reset via invite
      user_metadata: {
        first_name: first_name ?? "",
        last_name: last_name ?? "",
        user_type: "portal",
        company_id,
        portal_role: role ?? "member",
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

  // Send invitation email
  const { error: emailError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email);

  if (emailError) {
    console.error("Error sending invitation:", emailError);
    // User was created but email failed — don't block
  }

  // Fetch the portal_user record created by the trigger
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

  // Fetch the portal user being updated
  const { data: targetUser } = await supabaseAdmin
    .from("portal_users")
    .select("*")
    .eq("id", portal_user_id)
    .single();

  if (!targetUser) {
    return createErrorResponse(404, "Portal user not found");
  }

  // Check authorization
  const isSelf =
    profile.userType === "portal" && profile.data.id === targetUser.id;

  if (!isSelf && !canManageCompany(profile, targetUser.company_id)) {
    return createErrorResponse(401, "Not Authorized");
  }

  // Update auth user metadata
  const updateData: any = {
    user_metadata: {
      first_name: first_name ?? targetUser.first_name,
      last_name: last_name ?? targetUser.last_name,
    },
  };

  if (disabled !== undefined && canManageCompany(profile, targetUser.company_id)) {
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

  // Only admins can change role and disabled status
  if (canManageCompany(profile, targetUser.company_id)) {
    if (role !== undefined) updates.role = role;
    if (disabled !== undefined) updates.disabled = disabled;
  }

  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from("portal_users")
    .update(updates)
    .eq("id", portal_user_id)
    .select("*")
    .single();

  if (updateError || !updatedUser) {
    console.error("Error updating portal user:", updateError);
    return createErrorResponse(500, "Failed to update portal user");
  }

  return new Response(JSON.stringify({ data: updatedUser }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
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

  if (!canManageCompany(profile, targetUser.company_id)) {
    return createErrorResponse(401, "Not Authorized");
  }

  // Delete portal_users record
  const { error: deleteError } = await supabaseAdmin
    .from("portal_users")
    .delete()
    .eq("id", portal_user_id);

  if (deleteError) {
    console.error("Error deleting portal user:", deleteError);
    return createErrorResponse(500, "Failed to delete portal user");
  }

  // Delete auth user
  const { error: authError } =
    await supabaseAdmin.auth.admin.deleteUser(targetUser.user_id);

  if (authError) {
    console.error("Error deleting auth user:", authError);
    // Portal record already deleted, log but don't fail
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
