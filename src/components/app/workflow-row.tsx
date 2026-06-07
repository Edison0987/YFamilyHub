"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Play, Trash2 } from "lucide-react";
import type { Channel, Workflow } from "@/lib/types";
import { describeSchedule } from "@/lib/schedule";
import { deleteWorkflow, runWorkflowNow, toggleWorkflowActive } from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function WorkflowRow({ workflow, channel }: { workflow: Workflow; channel: Channel | undefined }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{workflow.title}</span>
          <Badge variant={workflow.active ? "success" : "secondary"}>
            {workflow.active ? "Active" : "Paused"}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          #{channel?.name ?? "unknown"} · {describeSchedule(workflow)} · {workflow.timezone}
        </p>
        {workflow.body ? (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground/80">{workflow.body}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const { channelId } = await runWorkflowNow(workflow.id);
                // Jump to the channel so you can see the reminder appear.
                router.push(`/channels/${channelId}`);
              } catch (e) {
                alert(e instanceof Error ? e.message : "Failed to run workflow.");
              }
            })
          }
        >
          <Play className="h-4 w-4" />
          Run now
        </Button>
        <Switch
          checked={workflow.active}
          disabled={pending}
          onCheckedChange={(v) => startTransition(() => void toggleWorkflowActive(workflow.id, v))}
          aria-label="Toggle active"
        />
        <Button asChild variant="ghost" size="icon">
          <Link href={`/workflows/${workflow.id}`} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-label="Delete"
          onClick={() => {
            if (confirm(`Delete workflow "${workflow.title}"? This removes future reminders.`)) {
              startTransition(() => void deleteWorkflow(workflow.id));
            }
          }}
        >
          <Trash2 className="h-4 w-4 text-red-400" />
        </Button>
      </div>
    </div>
  );
}
