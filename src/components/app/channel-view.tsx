"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash } from "lucide-react";
import type { Channel, MessageWithMeta, Profile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { MessageItem } from "@/components/app/message-item";
import { MessageComposer } from "@/components/app/message-composer";
import { ThreadPanel } from "@/components/app/thread-panel";

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
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  // Bumped on every realtime event so the open thread panel reloads too.
  const [version, setVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Realtime: refresh server data when anything in this channel changes ---
  useEffect(() => {
    const supabase = createClient();
    const channelSub = supabase
      .channel(`room-${channel.id}`)
      // New / changed messages in this channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` },
        () => {
          router.refresh();
          setVersion((v) => v + 1);
        },
      )
      // Workflow DONE status changes (no channel filter — affects any open card)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workflow_occurrences" },
        () => {
          router.refresh();
          setVersion((v) => v + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelSub);
    };
  }, [channel.id, router]);

  // Auto-scroll to the newest message when the list grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [initialMessages.length]);

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
          {initialMessages.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No messages yet. Say hello! 👋
            </p>
          ) : (
            initialMessages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                currentProfile={currentProfile}
                profiles={profiles}
                onOpenThread={setThreadRootId}
              />
            ))
          )}
        </div>

        <MessageComposer channelId={channel.id} currentUserId={currentProfile.id} />
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
