import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUserType } from "../portal/useUserType";
import { usePortalCompanyId } from "../portal/usePortalCompanyId";
import { supabase } from "../providers/supabase/supabase";
import { useConversations } from "./useConversations";
import { ConversationList } from "./ConversationList";
import { ChatView } from "./ChatView";
import { NewConversationDialog } from "./NewConversationDialog";
import { canonicalParticipants, type DmConversation } from "./types";
import { useState } from "react";

export const MessagingPage = () => {
  const { conversations, loading, currentUid, refetch } = useConversations();
  const { conversationId: convIdParam } = useParams<{
    conversationId?: string;
  }>();
  const navigate = useNavigate();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const userType = useUserType();
  const companyId = usePortalCompanyId();

  const selectedId = convIdParam ? parseInt(convIdParam, 10) : null;

  const activeConv = selectedId
    ? conversations.find((c) => c.id === selectedId) ?? null
    : null;

  // If we had a selectedId from URL but conversations loaded and it's not found, clear URL
  useEffect(() => {
    if (selectedId && !loading && conversations.length > 0 && !activeConv) {
      navigate("/messages", { replace: true });
    }
  }, [selectedId, loading, conversations, activeConv, navigate]);

  const handleSelect = useCallback(
    (conv: DmConversation) => {
      navigate(`/messages/${conv.id}`, { replace: true });
    },
    [navigate],
  );

  const handleSelectUser = useCallback(
    async (recipientUid: string) => {
      if (!currentUid) return;

      const [p1, p2] = canonicalParticipants(currentUid, recipientUid);

      const existing = conversations.find(
        (c) => c.participant_1_id === p1 && c.participant_2_id === p2,
      );

      if (existing) {
        navigate(`/messages/${existing.id}`, { replace: true });
        return;
      }

      const { data, error } = await supabase
        .from("dm_conversations")
        .insert({
          org_type: userType,
          company_id: userType === "portal" ? companyId : null,
          participant_1_id: p1,
          participant_2_id: p2,
        })
        .select()
        .single();

      if (!error && data) {
        await refetch();
        navigate(`/messages/${data.id}`, { replace: true });
      }
    },
    [currentUid, conversations, userType, companyId, refetch, navigate],
  );

  return (
    <div className="fixed inset-0 top-[48px] flex bg-background z-10">
      <ConversationList
        conversations={conversations}
        loading={loading}
        selectedId={activeConv?.id ?? null}
        onSelect={handleSelect}
        onNewConversation={() => setShowNewDialog(true)}
      />
      <ChatView conversation={activeConv} currentUid={currentUid} />

      <NewConversationDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onSelectUser={handleSelectUser}
      />
    </div>
  );
};
