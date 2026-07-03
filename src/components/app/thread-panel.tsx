"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { MessageWithMeta, Profile } from "@/lib/types";
import { loadThread } from "@/lib/actions";
import { MessageItem } from "@/components/app/message-item";
import { MessageComposer } from "@/components/app/message-composer";

export function ThreadPanel({
  rootId,
  channelId,
  currentProfile,
  profiles,
  version,
  onClose,
}: {
  rootId: string;
  channelId: string;
  currentProfile: Profile;
  profiles: Profile[];
  version: number;
  onClose: () => void;
}) {
  const [root, setRoot] = useState<MessageWithMeta | null>(null);
  const [replies, setReplies] = useState<MessageWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  // Internal counter bumped after a reply is sent so we reload immediately
  // without waiting for the parent's realtime "version" to propagate.
  const [localVersion, setLocalVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load (and reload on realtime "version" bumps OR after a local send).
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadThread(rootId).then((data) => {
      if (!active || !data) return;
      setRoot(data.root);
      setReplies(data.replies);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [rootId, version, localVersion]);

  // Scroll to the bottom whenever replies change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [replies.length]);

  const handleAfterSend = useCallback(() => {
    setLocalVersion((v) => v + 1);
  }, []);

  // Local patch/removal after edit / unsend / "delete for me" on a root or reply.
  const handleMessageChange = useCallback((id: string, patch: Partial<MessageWithMeta>) => {
    setRoot((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
    setReplies((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);
  const handleMessageRemove = useCallback(
    (id: string) => {
      if (root?.id === id) {
        onClose();
        return;
      }
      setReplies((prev) => prev.filter((m) => m.id !== id));
    },
    [root, onClose],
  );

  // A no-op for thread items: nested threads aren't supported in this MVP.
  const noop = () => {};

  return (
    <aside className="flex h-full w-[26rem] shrink-0 flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-semibold">Thread</h3>
        <button onClick={onClose} aria-label="Close thread" className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
        {loading && !root ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {root ? (
              <MessageItem
                message={root}
                currentProfile={currentProfile}
                profiles={profiles}
                onOpenThread={noop}
                onMessageChange={handleMessageChange}
                onMessageRemove={handleMessageRemove}
              />
            ) : null}

            <div className="my-2 px-4 text-xs font-medium text-muted-foreground">
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </div>

            {replies.map((r) => (
              <MessageItem
                key={r.id}
                message={r}
                currentProfile={currentProfile}
                profiles={profiles}
                onOpenThread={noop}
                onMessageChange={handleMessageChange}
                onMessageRemove={handleMessageRemove}
              />
            ))}
          </>
        )}
      </div>

      {/* Replies (with attachments) post into the same channel, under this root. */}
      <MessageComposer
        channelId={channelId}
        parentId={rootId}
        currentUserId={currentProfile.id}
        placeholder="Reply… (attach proof here)"
        onAfterSend={handleAfterSend}
      />
    </aside>
  );
}
