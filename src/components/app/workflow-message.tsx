"use client";

import { useTransition } from "react";
import { CheckCircle2, Circle, MessageSquare, Repeat, RotateCcw } from "lucide-react";
import type { MessageWithMeta, Profile } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { setOccurrenceDone } from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AttachmentView } from "@/components/app/attachment-view";

export function WorkflowMessage({
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
  const occ = message.occurrence!;
  const workflow = occ.workflow;
  const isDone = occ.status === "done";
  const [pending, startTransition] = useTransition();
  const isAdmin = currentProfile.role === "admin";

  const doneByName =
    occ.done_by ? profiles.find((p) => p.id === occ.done_by)?.full_name ?? "Someone" : null;

  function toggle(done: boolean) {
    startTransition(async () => {
      await setOccurrenceDone(occ.id, done);
    });
  }

  return (
    <div className="px-4 py-2">
      {/* Distinct card so workflow reminders stand out from normal chat. */}
      <div
        className={`rounded-lg border-l-4 p-4 ${
          isDone
            ? "border-l-emerald-500 bg-emerald-500/5"
            : "border-l-amber-500 bg-amber-500/5"
        } border border-border`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Workflow reminder
            </span>
          </div>
          <Badge variant={isDone ? "success" : "warning"}>{isDone ? "Done" : "Pending"}</Badge>
        </div>

        <h3 className="mt-2 text-lg font-semibold">{workflow?.title ?? message.body}</h3>
        {workflow?.body ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{workflow.body}</p>
        ) : null}

        <p className="mt-2 text-xs text-muted-foreground">
          Scheduled for {formatTime(occ.scheduled_for)}
        </p>

        {/* DONE state visible to everyone */}
        {isDone && occ.done_at ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Done by {doneByName} at {formatTime(occ.done_at)}
          </p>
        ) : null}

        {/* Attachments posted directly on the workflow message (rare, but supported) */}
        {message.attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <AttachmentView key={a.id} attachment={a} />
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!isDone ? (
            <Button size="sm" onClick={() => toggle(true)} disabled={pending}>
              <CheckCircle2 className="h-4 w-4" />
              Mark as done
            </Button>
          ) : (
            // Anyone can reopen; admins definitely. (RLS allows family members.)
            <Button size="sm" variant="outline" onClick={() => toggle(false)} disabled={pending}>
              {isAdmin ? <RotateCcw className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              Reopen
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={() => onOpenThread(message.id)}>
            <MessageSquare className="h-4 w-4" />
            {message.reply_count > 0
              ? `${message.reply_count} ${message.reply_count === 1 ? "reply" : "replies"}`
              : "Reply with proof"}
          </Button>
        </div>
      </div>
    </div>
  );
}
