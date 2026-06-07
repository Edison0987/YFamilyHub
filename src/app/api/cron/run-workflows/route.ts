import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isWorkflowDue } from "@/lib/schedule";
import type { Workflow } from "@/lib/types";

// This route is invoked by Vercel Cron (see vercel.json). It must run on the
// Node.js runtime because it uses the Supabase service-role key.
export const runtime = "nodejs";
// Never cache — always evaluate "now".
export const dynamic = "force-dynamic";

/**
 * The recurring workflow engine.
 *
 * For every active workflow we ask `isWorkflowDue()` whether a reminder should
 * exist for the current slot. If so, we:
 *   1. upsert a `workflow_occurrence` (the UNIQUE key prevents duplicates)
 *   2. post a `messages` row of type 'workflow' that links to that occurrence
 *
 * Because step 1 is idempotent, running the cron every hour (or even every few
 * minutes) will never create duplicate reminders for the same scheduled time.
 */
export async function GET(request: NextRequest) {
  // --- Authenticate the cron request ---
  // Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>".
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: workflows, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("active", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const created: string[] = [];
  let skipped = 0;

  for (const workflow of (workflows as Workflow[]) ?? []) {
    const due = isWorkflowDue(workflow, now);
    if (!due.due) continue;

    // 1. Create the occurrence. The UNIQUE (workflow_id, occurrence_key)
    //    constraint makes this a no-op if it already exists for this slot.
    const { data: occ, error: occErr } = await supabase
      .from("workflow_occurrences")
      .insert({
        workflow_id: workflow.id,
        occurrence_key: due.occurrenceKey,
        scheduled_for: due.scheduledFor.toISOString(),
        status: "pending",
      })
      .select("id")
      .single();

    if (occErr) {
      // 23505 = unique_violation => this slot was already posted. Skip quietly.
      if (occErr.code === "23505") {
        skipped++;
        continue;
      }
      await supabase.from("workflow_logs").insert({
        workflow_id: workflow.id,
        status: "error",
        detail: occErr.message,
      });
      continue;
    }

    // 2. Post the workflow message into the channel.
    const { error: msgErr } = await supabase.from("messages").insert({
      channel_id: workflow.channel_id,
      author_id: null, // system-generated
      body: workflow.title,
      type: "workflow",
      workflow_occurrence_id: occ.id,
    });

    if (msgErr) {
      await supabase.from("workflow_logs").insert({
        workflow_id: workflow.id,
        occurrence_id: occ.id,
        status: "error",
        detail: msgErr.message,
      });
      continue;
    }

    // 3. Bookkeeping.
    await supabase.from("workflows").update({ last_run_at: now.toISOString() }).eq("id", workflow.id);
    await supabase.from("workflow_logs").insert({
      workflow_id: workflow.id,
      occurrence_id: occ.id,
      status: "created",
      detail: `Posted occurrence ${due.occurrenceKey}`,
    });
    created.push(`${workflow.title} (${due.occurrenceKey})`);
  }

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), created, skipped });
}
