import { useQuery } from "@tanstack/react-query";
import { supabase } from "../providers/supabase/supabase";
import { useUserType } from "../portal/useUserType";
import type { OrgUser } from "./types";

export function useOrgUsers() {
  const userType = useUserType();

  return useQuery({
    queryKey: ["org_users", userType],
    queryFn: async (): Promise<OrgUser[]> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUid = session?.user?.id;
      if (!currentUid) return [];

      if (userType === "internal") {
        const { data } = await supabase
          .from("sales")
          .select("user_id, first_name, last_name, avatar")
          .eq("disabled", false);

        return (data ?? [])
          .filter((s) => s.user_id !== currentUid)
          .map((s) => ({
            authId: s.user_id,
            first_name: s.first_name,
            last_name: s.last_name,
            avatar: s.avatar,
          }));
      }

      // Portal: only same company
      const { data } = await supabase
        .from("portal_users")
        .select("user_id, first_name, last_name, avatar")
        .eq("disabled", false);

      return (data ?? [])
        .filter((p) => p.user_id !== currentUid)
        .map((p) => ({
          authId: p.user_id,
          first_name: p.first_name,
          last_name: p.last_name,
          avatar: p.avatar,
        }));
    },
  });
}
