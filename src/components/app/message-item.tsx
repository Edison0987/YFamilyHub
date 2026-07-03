"use client";

import { useRef, useState, useTransition } from "react";
import { EyeOff, MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { MessageWithMeta, Profile } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { editMessage, hideMessageForMe, unsendMessage } from "@/lib/actions";
import { Avatar } from "@/components/app/avatar";
import { AttachmentView } from "@/components/app/attachment-view";
import { WorkflowMessage } from "@/components/app/workflow-message";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MessageItem({
  message,
  currentProfile,
  profiles,
  onOpenThread,
  onMessageChange,
  onMessageRemove,
}: {
  // The optional pending/failed flags come from optimistic (not-yet-confirmed) sends.
  message: MessageWithMeta & { pending?: boolean; failed?: boolean };
  currentProfile: Profile;
  profiles: Profile[];
  onOpenThread: (id: string) => void;
  // Applies a local patch (e.g. after edit/unsend) without waiting for a refetch.
  onMessageChange?: (id: string, patch: Partial<MessageWithMeta>) => void;
  // Removes the message from the local list (used by "delete for me").
  onMessageRemove?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const isMine = message.author_id === currentProfile.id;
  const authorName = message.author?.full_name ?? "Unknown";

  // Placeholder for a message the sender unsent ("delete for everyone").
  if (message.deleted_at) {
    return (
      <div className="group flex gap-3 px-4 py-2">
        <Avatar name={authorName} id={message.author_id ?? message.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{authorName}</span>
            <span className="text-xs text-muted-foreground">{formatTime(message.created_at)}</span>
          </div>
          <p className="text-sm italic text-muted-foreground">This message was deleted</p>
        </div>
      </div>
    );
  }

  function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        await editMessage(message.id, trimmed);
        onMessageChange?.(message.id, { body: trimmed, edited_at: new Date().toISOString() });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to edit.");
      }
    });
  }

  function doUnsend() {
    if (!confirm("Unsend this message? It will show as deleted for everyone.")) return;
    startTransition(async () => {
      try {
        await unsendMessage(message.id);
        onMessageChange?.(message.id, { body: null, deleted_at: new Date().toISOString() });
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to unsend.");
      }
    });
  }

  function doHideForMe() {
    startTransition(async () => {
      try {
        await hideMessageForMe(message.id);
        onMessageRemove?.(message.id);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to delete.");
      }
    });
  }

  function onEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      setEditing(false);
      setDraft(message.body ?? "");
    }
  }

  return (
    <div
      className={`group flex gap-3 px-4 py-2 hover:bg-accent/30 ${
        message.pending ? "opacity-60" : ""
      }`}
    >
      <Avatar name={authorName} id={message.author_id ?? message.id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{authorName}</span>
          <span className="text-xs text-muted-foreground">
            {message.pending ? "Sending…" : message.failed ? "" : formatTime(message.created_at)}
          </span>
          {message.edited_at ? (
            <span className="text-xs text-muted-foreground">(edited)</span>
          ) : null}
          {message.failed ? <span className="text-xs text-red-400">Failed to send</span> : null}

          {!message.pending && !message.failed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Message actions"
                  className="ml-auto rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isMine ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setDraft(message.body ?? "");
                      setEditing(true);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </DropdownMenuItem>
                ) : null}
                {isMine ? (
                  <DropdownMenuItem onClick={doUnsend} disabled={pending}>
                    <Trash2 className="h-4 w-4" /> Unsend (delete for everyone)
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={doHideForMe} disabled={pending}>
                  <EyeOff className="h-4 w-4" /> Delete for me
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-1">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onEditKeyDown}
              rows={1}
              className="max-h-40 min-h-[36px] resize-none text-sm"
            />
            <div className="mt-1 flex items-center gap-2">
              <Button size="sm" onClick={saveEdit} disabled={pending}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.body ?? "");
                }}
                disabled={pending}
              >
                Cancel
              </Button>
              {error ? <span className="text-xs text-red-400">{error}</span> : null}
            </div>
          </div>
        ) : (
          <>
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

            {!message.pending && !message.failed ? (
              <button
                onClick={() => onOpenThread(message.id)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {message.reply_count > 0
                  ? `${message.reply_count} ${message.reply_count === 1 ? "reply" : "replies"}`
                  : "Reply"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
