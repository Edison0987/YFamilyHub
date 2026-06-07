"use client";

import { MessageSquare } from "lucide-react";
import type { MessageWithMeta, Profile } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { Avatar } from "@/components/app/avatar";
import { AttachmentView } from "@/components/app/attachment-view";
import { WorkflowMessage } from "@/components/app/workflow-message";

export function MessageItem({
  message,
  currentProfile,
  profiles,
  onOpenThread,
}: {
  message: MessageWithMeta;
  currentProfile: Profile;
  profiles: Profile[];
  onOpenThread: (id: string) => void;
}) {
  // Workflow-generated posts get their own distinctive card.
  if (message.type === "workflow" && message.occurrence) {
    return (
      <WorkflowMessage
        message={message}
        currentProfile={currentProfile}
        profiles={profiles}
        onOpenThread={onOpenThread}
      />
    );
  }

  const authorName = message.author?.full_name ?? "Unknown";

  return (
    <div className="group flex gap-3 px-4 py-2 hover:bg-accent/30">
      <Avatar name={authorName} id={message.author_id ?? message.id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{authorName}</span>
          <span className="text-xs text-muted-foreground">{formatTime(message.created_at)}</span>
        </div>

        {message.body ? (
          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        ) : null}

        {message.attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <AttachmentView key={a.id} attachment={a} />
            ))}
          </div>
        ) : null}

        <button
          onClick={() => onOpenThread(message.id)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {message.reply_count > 0
            ? `${message.reply_count} ${message.reply_count === 1 ? "reply" : "replies"}`
            : "Reply"}
        </button>
      </div>
    </div>
  );
}
