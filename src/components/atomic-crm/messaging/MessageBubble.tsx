import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DmMessage } from "./types";

export const MessageBubble = ({
  message,
  isMine,
  showAvatar,
  initials,
}: {
  message: DmMessage;
  isMine: boolean;
  showAvatar?: boolean;
  initials?: string;
}) => {
  const [lightbox, setLightbox] = useState(false);

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isOptimistic = message.id < 0;
  const hasImage = !!message.image_url;
  const hasText = !!message.body;
  const imageOnly = hasImage && !hasText;

  return (
    <>
      <div
        className={cn(
          "flex items-end gap-2 mb-1 w-full",
          isMine ? "justify-end" : "justify-start",
        )}
      >
        {/* Avatar space */}
        {!isMine && (
          <div className="w-7 shrink-0">
            {showAvatar && (
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-[9px] font-bold">
                {initials}
              </div>
            )}
          </div>
        )}

        {imageOnly ? (
          /* Image-only: no bubble background, just a floating rounded image */
          <div className="max-w-[70%]">
            <img
              src={message.image_url!}
              alt=""
              onClick={() => !isOptimistic && setLightbox(true)}
              className={cn(
                "max-w-full max-h-[300px] rounded-2xl object-cover",
                isOptimistic
                  ? "opacity-50 brightness-75"
                  : "cursor-pointer hover:brightness-95 transition",
              )}
            />
            <p
              className={cn(
                "text-[10px] mt-0.5 text-muted-foreground/50",
                isMine ? "text-right" : "text-left",
                isOptimistic
                  ? "opacity-100"
                  : "opacity-0 group-hover/msg:opacity-100 transition-opacity",
              )}
            >
              {isOptimistic ? "Sending..." : time}
            </p>
          </div>
        ) : (
          /* Text or text+image: normal bubble */
          <div
            className={cn(
              "max-w-[70%] text-sm leading-normal",
              isMine
                ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                : "bg-muted rounded-2xl rounded-bl-sm",
              hasImage ? "p-1.5 pb-2" : "px-3 py-2",
              isOptimistic && "opacity-60",
            )}
          >
            {hasImage && (
              <img
                src={message.image_url!}
                alt=""
                onClick={() => !isOptimistic && setLightbox(true)}
                className={cn(
                  "max-w-full max-h-[300px] rounded-xl object-cover mb-1.5",
                  isOptimistic
                    ? "opacity-60 brightness-75"
                    : "cursor-pointer hover:brightness-95 transition",
                )}
              />
            )}
            {hasText && (
              <p className={cn("whitespace-pre-wrap break-words", hasImage && "px-1.5")}>
                {message.body}
              </p>
            )}
            <p
              className={cn(
                "text-[10px] mt-0.5 text-right",
                hasImage && "px-1.5",
                isMine
                  ? "text-primary-foreground/50"
                  : "text-muted-foreground/50",
                isOptimistic
                  ? "opacity-100"
                  : "opacity-0 group-hover/msg:opacity-100 transition-opacity",
              )}
            >
              {isOptimistic ? "Sending..." : time}
            </p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && hasImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setLightbox(false)}
        >
          <img
            src={message.image_url!}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
};
