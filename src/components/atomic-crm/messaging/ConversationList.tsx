import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SquarePen } from "lucide-react";
import type { DmConversation } from "./types";

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

const SkeletonItem = () => (
  <div className="px-5 py-3 flex items-center gap-3 animate-pulse">
    <div className="h-12 w-12 rounded-full bg-muted shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="h-3.5 w-24 bg-muted rounded" />
        <div className="h-3 w-10 bg-muted rounded" />
      </div>
      <div className="h-3 w-36 bg-muted rounded" />
    </div>
  </div>
);

export const ConversationList = ({
  conversations,
  loading,
  selectedId,
  onSelect,
  onNewConversation,
}: {
  conversations: DmConversation[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (conv: DmConversation) => void;
  onNewConversation: () => void;
}) => {
  return (
    <div className="w-[350px] border-r flex flex-col shrink-0">
      {/* Header */}
      <div className="h-[60px] flex items-center justify-between px-5 border-b">
        <h2 className="text-lg font-bold">Messages</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onNewConversation}
          title="New message"
        >
          <SquarePen className="h-5 w-5" />
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
          </>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <p className="text-muted-foreground text-sm">No messages yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Start a conversation with a team member
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            const name = conv.otherUser
              ? `${conv.otherUser.first_name} ${conv.otherUser.last_name}`
              : "Unknown";
            const initials = conv.otherUser
              ? getInitials(
                  conv.otherUser.first_name,
                  conv.otherUser.last_name,
                )
              : "?";
            const isSelected = selectedId === conv.id;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={cn(
                  "w-full text-left px-5 py-3 flex items-center gap-3 transition-colors",
                  isSelected ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-sm font-bold">
                    {initials}
                  </div>
                </div>

                {/* Name + preview */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">
                      {name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  {conv.last_message_preview && (
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {conv.last_message_preview}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
