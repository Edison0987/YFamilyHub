import { redirect } from "next/navigation";
import { getChannels, getCurrentProfile } from "@/lib/data";
import { createWorkflow } from "@/lib/actions";
import { WorkflowForm } from "@/components/app/workflow-form";

export default async function NewWorkflowPage() {
  const [profile, channels] = await Promise.all([getCurrentProfile(), getChannels()]);
  if (profile?.role !== "admin") redirect("/workflows");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-xl font-semibold">New workflow</h2>
      </header>
      <div className="p-6">
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a channel first, then add a workflow.</p>
        ) : (
          <WorkflowForm channels={channels} action={createWorkflow} submitLabel="Create workflow" />
        )}
      </div>
    </div>
  );
}
