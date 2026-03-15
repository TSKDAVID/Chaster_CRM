import { type User } from "jsr:@supabase/supabase-js@2";
import { supabaseAdmin } from "./supabaseAdmin.ts";

export type UserProfile =
  | { userType: "internal"; data: any }
  | { userType: "portal"; data: any }
  | null;

/**
 * Get the profile (sale or portal_user) associated to the provided user.
 */
export const getUserProfile = async (user: User): Promise<UserProfile> => {
  // Try sales first
  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (sale) {
    return { userType: "internal", data: sale };
  }

  // Try portal_users
  const { data: portalUser } = await supabaseAdmin
    .from("portal_users")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (portalUser) {
    return { userType: "portal", data: portalUser };
  }

  return null;
};
