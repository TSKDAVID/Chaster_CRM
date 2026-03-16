import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMessages } from "./useMessages";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import type { DmConversation } from "./types";

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export const ChatView = ({
  conversation,
  currentUid,
}: {
  conversation: DmConversation | null;
  currentUid: string | null;
}) => {
  const { messages, loading, sendMessage } = useMessages(
    conversation?.id ?? null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-20 w-20 rounded-full border-2 border-muted-foreground/20 flex items-center justify-center mx-auto">
            <MessageSquare className="h-9 w-9 text-muted-foreground/40" />
          </div>
          <div>
            <p className="text-xl font-light">Your messages</p>
            <p className="text-sm text-muted-foreground mt-1">
              Send private messages to your team
            </p>
          </div>
        </div>
      </div>
    );
  }

  const otherName = conversation.otherUser
    ? `${conversation.otherUser.first_name} ${conversation.otherUser.last_name}`
    : "Unknown User";

  const initials = conversation.otherUser
    ? getInitials(
        conversation.otherUser.first_name,
        conversation.otherUser.last_name,
      )
    : "?";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="h-[60px] flex items-center gap-3 px-5 border-b shrink-0">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {initials}
        </div>
        <span className="font-semibold text-sm">{otherName}</span>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-lg font-bold">
              {initials}
            </div>
            <p className="font-semibold">{otherName}</p>
            <p className="text-sm text-muted-foreground">
              Start of your conversation
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMine = msg.sender_id === currentUid;
            const prevMsg = messages[idx - 1];
            const isNewSender = !prevMsg || prevMsg.sender_id !== msg.sender_id;
            const timeDiff = prevMsg
              ? new Date(msg.created_at).getTime() -
                new Date(prevMsg.created_at).getTime()
              : Infinity;
            const showGap = timeDiff > 60000; // 1 minute gap

            return (
              <div key={msg.id} className="group/msg">
                {(isNewSender || showGap) && <div className="h-2" />}
                <MessageBubble
                  message={msg}
                  isMine={isMine}
                  showAvatar={!isMine && isNewSender}
                  initials={initials}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <MessageInput onSend={sendMessage} />
    </div>
  );
};
