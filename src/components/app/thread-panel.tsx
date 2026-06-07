"use client";

import { useEffect, useState } from "react";
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

  // Load (and reload on realtime "version" bumps) the thread contents.
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
  }, [rootId, version]);

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

      <div className="flex-1 overflow-y-auto py-2">
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
      />
    </aside>
  );
}
