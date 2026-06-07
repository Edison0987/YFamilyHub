import Link from "next/link";
import { Plus } from "lucide-react";
import { getChannels, getCurrentProfile, getWorkflows } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { WorkflowRow } from "@/components/app/workflow-row";

export default async function WorkflowsPage() {
  const [profile, workflows, channels] = await Promise.all([
    getCurrentProfile(),
    getWorkflows(),
    getChannels(),
  ]);
  const isAdmin = profile?.role === "admin";
  const channelById = new Map(channels.map((c) => [c.id, c]));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold">Workflows</h2>
          <p className="text-sm text-muted-foreground">Recurring reminders that auto-post with a DONE button.</p>
        </div>
        {isAdmin ? (
          <Button asChild>
            <Link href="/workflows/new">
              <Plus className="h-4 w-4" />
              New workflow
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {workflows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workflows yet.{isAdmin ? " Create one to start sending automatic reminders." : ""}
          </p>
        ) : (
          <div className="space-y-3">
            {workflows.map((w) => (
              <WorkflowRow key={w.id} workflow={w} channel={channelById.get(w.channel_id)} />
            ))}
          </div>
        )}

        {!isAdmin ? (
          <p className="mt-6 text-xs text-muted-foreground">Only admins can create or edit workflows.</p>
        ) : null}
      </div>
    </div>
  );
}
