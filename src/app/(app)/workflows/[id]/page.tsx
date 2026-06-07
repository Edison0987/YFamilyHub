import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getChannels, getCurrentProfile } from "@/lib/data";
import { updateWorkflow } from "@/lib/actions";
import { WorkflowForm } from "@/components/app/workflow-form";
import type { Workflow } from "@/lib/types";

export default async function EditWorkflowPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") redirect("/workflows");

  const supabase = await createClient();
  const [{ data: workflow }, channels] = await Promise.all([
    supabase.from("workflows").select("*").eq("id", id).single(),
    getChannels(),
  ]);
  if (!workflow) notFound();

  // Bind the workflow id so the form can call the action with just FormData.
  const action = updateWorkflow.bind(null, id);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-xl font-semibold">Edit workflow</h2>
      </header>
      <div className="p-6">
        <WorkflowForm
          channels={channels}
          action={action}
          initial={workflow as Workflow}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
