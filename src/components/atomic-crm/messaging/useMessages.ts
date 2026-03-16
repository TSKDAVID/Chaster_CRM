import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../providers/supabase/supabase";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import type { DmMessage } from "./types";

export function useMessages(conversationId: number | null) {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const currentUidRef = useRef<string | null>(null);
  // Track optimistic temp IDs so realtime can replace them
  const pendingRef = useRef<
    Map<string, number>
  >(new Map());

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    currentUidRef.current = session?.user?.id ?? null;

    const { data } = await supabase
      .from("dm_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    setMessages(data ?? []);
    pendingRef.current.clear();
    setLoading(false);

    if (data && currentUidRef.current) {
      const unread = data.filter(
        (m) => m.sender_id !== currentUidRef.current && !m.read_at,
      );
      if (unread.length > 0) {
        await supabase
          .from("dm_messages")
          .update({ read_at: new Date().toISOString() })
          .in(
            "id",
            unread.map((m) => m.id),
          );
      }
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`dm-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as DmMessage;

          setMessages((prev) => {
            // Already have this real message
            if (prev.some((m) => m.id === newMsg.id)) return prev;

            // Check if this replaces an optimistic message
            // Match by sender — find the oldest pending optimistic from this sender
            const optimisticIdx = prev.findIndex(
              (m) => m.id < 0 && m.sender_id === newMsg.sender_id,
            );

            if (optimisticIdx !== -1) {
              const opt = prev[optimisticIdx];
              const next = [...prev];
              // Keep the blob URL if the optimistic had one — avoids
              // re-downloading the image from the public URL (which
              // causes a disappear/reappear flash).
              const keepBlobUrl =
                opt.image_url?.startsWith("blob:") && newMsg.image_url;
              next[optimisticIdx] = {
                ...newMsg,
                image_url: keepBlobUrl ? opt.image_url : newMsg.image_url,
              };
              return next;
            }

            return [...prev, newMsg];
          });

          if (newMsg.sender_id !== currentUidRef.current) {
            supabase
              .from("dm_messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMsg.id)
              .then();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    (body: string, file?: File | null) => {
      if (!conversationId || !currentUidRef.current) return;
      if (!body.trim() && !file) return;

      const tempId = -Date.now();
      const localUrl = file ? URL.createObjectURL(file) : undefined;

      const optimistic: DmMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: currentUidRef.current,
        body: body.trim(),
        image_url: localUrl ?? null,
        created_at: new Date().toISOString(),
        read_at: null,
      };

      setMessages((prev) => [...prev, optimistic]);

      const doInsert = (imageUrl?: string) => {
        const row: Record<string, unknown> = {
          conversation_id: conversationId,
          sender_id: currentUidRef.current,
          body: body.trim(),
        };
        if (imageUrl) row.image_url = imageUrl;

        supabase
          .from("dm_messages")
          .insert(row)
          .then(({ error }) => {
            if (error) {
              console.error("Failed to send message:", error);
              setMessages((prev) => prev.filter((m) => m.id !== tempId));
              if (localUrl) URL.revokeObjectURL(localUrl);
            }
            // Don't revoke blob URL here — keep it alive so the image
            // stays visible until the conversation changes or unmounts.
          });
      };

      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `dm/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, file)
          .then(({ error: uploadError }) => {
            if (uploadError) {
              console.error("Failed to upload image:", uploadError);
              setMessages((prev) => prev.filter((m) => m.id !== tempId));
              if (localUrl) URL.revokeObjectURL(localUrl);
              return;
            }
            const { data: urlData } = supabase.storage
              .from(ATTACHMENTS_BUCKET)
              .getPublicUrl(path);
            doInsert(urlData.publicUrl);
          });
      } else {
        doInsert();
      }
    },
    [conversationId],
  );

  return { messages, loading, sendMessage };
}
