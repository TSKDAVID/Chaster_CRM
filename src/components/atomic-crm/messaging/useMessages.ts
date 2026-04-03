import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../providers/supabase/supabase";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import type { DmMessage } from "./types";

/** True if a server row is almost certainly the same message as an optimistic one. */
function serverCoversOptimistic(opt: DmMessage, server: DmMessage[]): boolean {
  return server.some((s) => {
    if (s.id < 0 || s.sender_id !== opt.sender_id) return false;
    if (s.body !== opt.body) return false;
    const optImg = Boolean(opt.image_url);
    const sImg = Boolean(s.image_url);
    if (optImg !== sImg) return false;
    const dt =
      new Date(s.created_at).getTime() - new Date(opt.created_at).getTime();
    if (Math.abs(dt) > 120_000) return false;
    return true;
  });
}

function mergeServerWithOptimistic(
  server: DmMessage[],
  prev: DmMessage[],
  conversationId: number,
): DmMessage[] {
  const optimistics = prev.filter(
    (m) => m.id < 0 && m.conversation_id === conversationId,
  );
  if (optimistics.length === 0) return server;
  const keep = optimistics.filter((o) => !serverCoversOptimistic(o, server));
  const merged = [...server, ...keep];
  merged.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return merged;
}

export function useMessages(conversationId: number | null) {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const currentUidRef = useRef<string | null>(null);

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

    const server = data ?? [];
    setMessages((prev) =>
      mergeServerWithOptimistic(server, prev, conversationId),
    );
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

  useEffect(() => {
    if (!conversationId) return;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      currentUidRef.current = session?.user?.id ?? null;
    });
  }, [conversationId]);

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

      const applyConfirmedMessage = (real: DmMessage) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === real.id)) return prev;
          const optimisticIdx = prev.findIndex((m) => m.id === tempId);
          if (optimisticIdx === -1) {
            return [...prev, real];
          }
          const opt = prev[optimisticIdx];
          const keepBlobUrl =
            opt.image_url?.startsWith("blob:") && real.image_url;
          const next = [...prev];
          next[optimisticIdx] = {
            ...real,
            image_url: keepBlobUrl ? opt.image_url : real.image_url,
          };
          return next;
        });
      };

      const doInsert = (imageUrl?: string) => {
        const row: Record<string, unknown> = {
          conversation_id: conversationId,
          sender_id: currentUidRef.current,
          body: body.trim(),
        };
        if (imageUrl) row.image_url = imageUrl;

        void supabase
          .from("dm_messages")
          .insert(row)
          .select()
          .single()
          .then(({ data, error }) => {
            if (error) {
              console.error("Failed to send message:", error);
              setMessages((prev) => prev.filter((m) => m.id !== tempId));
              if (localUrl) URL.revokeObjectURL(localUrl);
              return;
            }
            if (data) {
              applyConfirmedMessage(data as DmMessage);
            }
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
