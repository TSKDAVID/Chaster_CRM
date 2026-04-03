import { memo, useLayoutEffect, useRef, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DmMessage } from "./types";

function isImageDecoded(el: HTMLImageElement | null): boolean {
  return Boolean(el?.complete && el.naturalHeight > 0);
}

/** Image attachment with a placeholder until decode (handles cache: `onLoad` may never fire). */
function DmMessageImage({
  src,
  roundedClass,
  isOptimistic,
  onOpenLightbox,
}: {
  src: string;
  roundedClass: string;
  isOptimistic: boolean;
  onOpenLightbox: () => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) {
      setLoaded(false);
      return;
    }
    if (isImageDecoded(el)) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const p = el.decode?.();
    if (p && typeof p.then === "function") {
      void p
        .then(() => setLoaded(true))
        .catch(() => {
          /* broken / unsupported; onError or onLoad still may run */
        });
    }
  }, [src]);

  return (
    <div
      className={cn("relative w-fit max-w-full overflow-hidden", roundedClass)}
    >
      {!loaded && (
        <div
          className={cn(
            "relative z-[1] flex min-h-[140px] w-[min(280px,72vw)] max-w-full flex-col items-center justify-center gap-2 border border-dashed border-muted-foreground/30 bg-muted/60 px-4 py-6 text-center text-muted-foreground",
            roundedClass,
          )}
          aria-busy
        >
          <ImageIcon className="h-9 w-9 shrink-0 opacity-40" aria-hidden />
          <span className="text-xs font-medium">
            {isOptimistic ? "Sending photo…" : "Loading image…"}
          </span>
          <Loader2
            className="h-5 w-5 shrink-0 animate-spin opacity-70"
            aria-hidden
          />
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt=""
        loading="eager"
        decoding="async"
        onLoad={() => {
          if (isImageDecoded(imgRef.current)) setLoaded(true);
        }}
        onError={() => setLoaded(true)}
        onClick={() => !isOptimistic && loaded && onOpenLightbox()}
        className={cn(
          "max-h-[300px] max-w-full object-cover transition-opacity duration-200",
          roundedClass,
          loaded
            ? "relative z-[1] block opacity-100"
            : "pointer-events-none absolute inset-0 z-0 h-full w-full opacity-0",
          isOptimistic
            ? "cursor-default brightness-90"
            : loaded && "cursor-pointer hover:brightness-95",
        )}
      />
    </div>
  );
}

export const MessageBubble = memo(
  ({
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
            <div className="max-w-[70%]">
              <DmMessageImage
                src={message.image_url!}
                roundedClass="rounded-2xl"
                isOptimistic={isOptimistic}
                onOpenLightbox={() => setLightbox(true)}
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
                <DmMessageImage
                  src={message.image_url!}
                  roundedClass="rounded-xl"
                  isOptimistic={isOptimistic}
                  onOpenLightbox={() => setLightbox(true)}
                />
              )}
              {hasText && (
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    hasImage && "px-1.5 mt-1.5",
                  )}
                >
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

        {lightbox && hasImage && (
          <div
            role="dialog"
            aria-label="Image preview"
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
            onClick={() => setLightbox(false)}
            onKeyDown={(e) => e.key === "Escape" && setLightbox(false)}
            tabIndex={0}
          >
            <img
              src={message.image_url!}
              alt="Full size preview"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        )}
      </>
    );
  },
);

MessageBubble.displayName = "MessageBubble";
