import { useCallback, useEffect, useState } from "react";
import { supabase } from "../providers/supabase/supabase";
import { useUserType } from "../portal/useUserType";
import type { DmConversation, OrgUser } from "./types";

export function useConversations() {
  const userType = useUserType();
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    setCurrentUid(uid);

    const { data: convos } = await supabase
      .from("dm_conversations")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (!convos) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Resolve other user names
    const otherUids = convos.map((c) =>
      c.participant_1_id === uid ? c.participant_2_id : c.participant_1_id,
    );
    const uniqueUids = [...new Set(otherUids)];

    let userMap: Record<string, OrgUser> = {};

    if (userType === "internal") {
      const { data: sales } = await supabase
        .from("sales")
        .select("user_id, first_name, last_name, avatar")
        .in("user_id", uniqueUids);

      for (const s of sales ?? []) {
        userMap[s.user_id] = {
          authId: s.user_id,
          first_name: s.first_name,
          last_name: s.last_name,
          avatar: s.avatar,
        };
      }
    } else {
      const { data: portalUsers } = await supabase
        .from("portal_users")
        .select("user_id, first_name, last_name, avatar")
        .in("user_id", uniqueUids);

      for (const p of portalUsers ?? []) {
        userMap[p.user_id] = {
          authId: p.user_id,
          first_name: p.first_name,
          last_name: p.last_name,
          avatar: p.avatar,
        };
      }
    }

    const enriched: DmConversation[] = convos.map((c) => {
      const otherUid =
        c.participant_1_id === uid ? c.participant_2_id : c.participant_1_id;
      const other = userMap[otherUid];
      return {
        ...c,
        otherUser: other
          ? {
              id: other.authId,
              first_name: other.first_name,
              last_name: other.last_name,
              avatar: other.avatar,
            }
          : { id: otherUid, first_name: "Unknown", last_name: "User" },
      };
    });

    setConversations(enriched);
    setLoading(false);
  }, [userType]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime: refresh list when conversations are updated (last_message_at changes)
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;

    const channel = supabase
      .channel("dm-conversation-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dm_conversations" },
        () => {
          // Debounce: multiple rapid messages should only trigger one refetch
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(fetchConversations, 300);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_conversations" },
        () => {
          fetchConversations();
        },
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  return { conversations, loading, currentUid, refetch: fetchConversations };
}
