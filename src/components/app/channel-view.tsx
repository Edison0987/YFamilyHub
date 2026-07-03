"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash } from "lucide-react";
import type { Attachment, Channel, MessageWithMeta, Profile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, type NewAttachment } from "@/lib/actions";
import { uploadFile } from "@/lib/upload";
import { MessageItem } from "@/components/app/message-item";
import { MessageComposer } from "@/components/app/message-composer";
import { ThreadPanel } from "@/components/app/thread-panel";

// A message plus client-only flags for the optimistic "sending" state.
export type LocalMessage = MessageWithMeta & { pending?: boolean; failed?: boolean };

export function ChannelView({
  channel,
  initialMessages,
  currentProfile,
  profiles,
}: {
  channel: Channel;
  initialMessages: MessageWithMeta[];
  currentProfile: Profile;
  profiles: Profile[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumped on realtime so the thread panel reloads
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merge fresh server data (from router.refresh) with any local messages the
  // server hasn't caught up to yet (in-flight optimistic sends).
  useEffect(() => {
    setMessages((prev) => {
      const serverIds = new Set(initialMessages.map((m) => m.id));
      const localOnly = prev.filter((m) => !serverIds.has(m.id));
      return [...initialMessages, ...localOnly];
    });
  }, [initialMessages]);

  // Coalesce realtime events into a single refresh shortly after they arrive,
  // instead of refetching on every keystroke-fast event.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      router.refresh();
      setVersion((v) => v + 1);
    }, 350);
  }, [router]);

  // --- Realtime: reconcile when anything in this channel changes ---
  useEffect(() => {
    const supabase = createClient();
    const sub = supabase
      .channel(`room-${channel.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workflow_occurrences" },
        () => scheduleRefresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [channel.id, scheduleRefresh]);

  // Auto-scroll to the newest message when the list grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // The instant-send handler: show the message now, confirm with the server after.
  const handleSend = useCallback(
    ({ body, files }: { body: string; files: File[] }) => {
      const tempId = `optimistic-${crypto.randomUUID()}`;

      const optimistic: LocalMessage = {
        id: tempId,
        channel_id: channel.id,
        parent_id: null,
        author_id: currentProfile.id,
        body: body.trim() || null,
        type: "user",
        workflow_occurrence_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        author: currentProfile,
        attachments: [],
        occurrence: null,
        reply_count: 0,
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);

      // Do the real work in the background.
      (async () => {
        try {
          const uploaded: NewAttachment[] = [];
          for (const f of files) uploaded.push(await uploadFile(f, channel.id, currentProfile.id));
          const { id } = await sendMessage({ channelId: channel.id, body, attachments: uploaded });

          // Build display attachments so they appear without waiting for a refetch.
          const attachments: Attachment[] = uploaded.map((a, i) => ({
            id: `${id}-${i}`,
            message_id: id,
            uploaded_by: currentProfile.id,
            storage_path: a.storage_path,
            file_name: a.file_name,
            mime_type: a.mime_type,
            size_bytes: a.size_bytes,
            created_at: new Date().toISOString(),
          }));

          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, id, pending: false, attachments } : m)),
          );
        } catch {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
          );
        }
      })();
    },
    [channel.id, currentProfile],
  );

  // Local patch/removal after edit / unsend / "delete for me" — instant feedback
  // without waiting for the realtime round-trip.
  const handleMessageChange = useCallback((id: string, patch: Partial<LocalMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);
  const handleMessageRemove = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* Main channel column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Hash className="h-5 w-5 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{channel.name}</h2>
            {channel.description ? (
              <p className="truncate text-xs text-muted-foreground">{channel.description}</p>
            ) : null}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
          {messages.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No messages yet. Say hello! 👋
            </p>
          ) : (
            messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                currentProfile={currentProfile}
                profiles={profiles}
                onOpenThread={setThreadRootId}
                onMessageChange={handleMessageChange}
                onMessageRemove={handleMessageRemove}
              />
            ))
          )}
        </div>

        <MessageComposer
          channelId={channel.id}
          currentUserId={currentProfile.id}
          onOptimisticSend={handleSend}
        />
      </div>

      {/* Thread / replies panel */}
      {threadRootId ? (
        <ThreadPanel
          key={threadRootId}
          rootId={threadRootId}
          channelId={channel.id}
          currentProfile={currentProfile}
          profiles={profiles}
          version={version}
          onClose={() => setThreadRootId(null)}
        />
      ) : null}
    </div>
  );
}
