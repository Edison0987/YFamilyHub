"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getThread } from "@/lib/data";
import type { Role, ScheduleType } from "@/lib/types";

// Server action wrapper so client components can (re)load a thread on demand.
export async function loadThread(rootId: string) {
  await requireUser();
  return getThread(rootId);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, user };
}

async function requireAdmin() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (data?.role !== "admin") throw new Error("Admins only.");
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
export async function createChannel(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  if (!name) throw new Error("Channel name is required.");

  const { data, error } = await supabase
    .from("channels")
    .insert({ name, description, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Add the creator as an explicit member (optional bookkeeping).
  await supabase.from("channel_members").insert({ channel_id: data.id, user_id: user.id });

  revalidatePath("/", "layout");
  redirect(`/channels/${data.id}`);
}

// ---------------------------------------------------------------------------
// Messages (normal messages, thread replies, and replies to workflow posts)
// ---------------------------------------------------------------------------
export type NewAttachment = {
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export async function sendMessage(args: {
  channelId: string;
  parentId?: string | null;
  body: string;
  attachments?: NewAttachment[];
}) {
  const { supabase, user } = await requireUser();
  const body = args.body.trim();
  const attachments = args.attachments ?? [];

  if (!body && attachments.length === 0) {
    throw new Error("Message cannot be empty.");
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      channel_id: args.channelId,
      parent_id: args.parentId ?? null,
      author_id: user.id,
      body: body || null,
      type: "user",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (attachments.length) {
    const rows = attachments.map((a) => ({ ...a, message_id: message.id, uploaded_by: user.id }));
    const { error: attErr } = await supabase.from("attachments").insert(rows);
    if (attErr) throw new Error(attErr.message);
  }

  revalidatePath(`/channels/${args.channelId}`);
  return { id: message.id as string };
}

/** Edit your own message body. No time limit, but only the sender may edit. */
export async function editMessage(messageId: string, body: string) {
  const { supabase, user } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");

  const { data: existing, error: fetchErr } = await supabase
    .from("messages")
    .select("author_id, channel_id, deleted_at")
    .eq("id", messageId)
    .single();
  if (fetchErr || !existing) throw new Error("Message not found.");
  if (existing.author_id !== user.id) throw new Error("You can only edit your own messages.");
  if (existing.deleted_at) throw new Error("Cannot edit a deleted message.");

  const { error } = await supabase
    .from("messages")
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw new Error(error.message);

  revalidatePath(`/channels/${existing.channel_id}`);
  return { ok: true };
}

/**
 * "Unsend" — delete for everyone. Only the original sender may do this.
 * Leaves a "[deleted]" placeholder row (and drops its attachments) rather than
 * hard-deleting, so reply threads under it stay intact.
 */
export async function unsendMessage(messageId: string) {
  const { supabase, user } = await requireUser();

  const { data: existing, error: fetchErr } = await supabase
    .from("messages")
    .select("author_id, channel_id")
    .eq("id", messageId)
    .single();
  if (fetchErr || !existing) throw new Error("Message not found.");
  if (existing.author_id !== user.id) throw new Error("You can only unsend your own messages.");

  await supabase.from("attachments").delete().eq("message_id", messageId);

  const { error } = await supabase
    .from("messages")
    .update({ body: null, deleted_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw new Error(error.message);

  revalidatePath(`/channels/${existing.channel_id}`);
  return { ok: true };
}

/** "Delete for me" — hide a message from just the current viewer. */
export async function hideMessageForMe(messageId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("message_hides")
    .upsert({ message_id: messageId, user_id: user.id }, { onConflict: "message_id,user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Workflow DONE button (per-occurrence status)
// ---------------------------------------------------------------------------
export async function setOccurrenceDone(occurrenceId: string, done: boolean) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("workflow_occurrences")
    .update(
      done
        ? { status: "done", done_by: user.id, done_at: new Date().toISOString() }
        : { status: "pending", done_by: null, done_at: null },
    )
    .eq("id", occurrenceId);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Workflows (admin only)
// ---------------------------------------------------------------------------
function parseWorkflowForm(formData: FormData) {
  const schedule_type = String(formData.get("schedule_type") || "daily") as ScheduleType;
  const numOrNull = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : Number(v);
  };
  const strOrNull = (k: string) => {
    const v = String(formData.get(k) || "").trim();
    return v === "" ? null : v;
  };

  return {
    title: String(formData.get("title") || "").trim(),
    body: strOrNull("body"),
    channel_id: String(formData.get("channel_id") || ""),
    schedule_type,
    time_of_day: String(formData.get("time_of_day") || "09:00"),
    timezone: String(formData.get("timezone") || "Asia/Manila"),
    day_of_week: schedule_type === "weekly" ? numOrNull("day_of_week") : null,
    day_of_month: schedule_type === "monthly" ? numOrNull("day_of_month") : null,
    run_date: schedule_type === "once" ? strOrNull("run_date") : null,
    cron_expr: schedule_type === "cron" ? strOrNull("cron_expr") : null,
    active: formData.get("active") === "on" || formData.get("active") === "true",
  };
}

export async function createWorkflow(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const values = parseWorkflowForm(formData);
  if (!values.title) throw new Error("Title is required.");
  if (!values.channel_id) throw new Error("Please choose a channel.");

  const { error } = await supabase.from("workflows").insert({ ...values, created_by: user.id });
  if (error) throw new Error(error.message);

  revalidatePath("/workflows");
  redirect("/workflows");
}

export async function updateWorkflow(id: string, formData: FormData) {
  const { supabase } = await requireAdmin();
  const values = parseWorkflowForm(formData);
  if (!values.title) throw new Error("Title is required.");

  const { error } = await supabase.from("workflows").update(values).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/workflows");
  redirect("/workflows");
}

/**
 * Post a workflow reminder to its channel RIGHT NOW, for testing — without
 * waiting for the schedule. Uses a unique "test-" occurrence key so it does NOT
 * interfere with the real recurring schedule (the next real run still happens).
 *
 * Inserts via the service-role client because workflow-type messages bypass the
 * normal RLS (same as the cron route does).
 */
export async function runWorkflowNow(workflowId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: wf } = await admin.from("workflows").select("*").eq("id", workflowId).single();
  if (!wf) throw new Error("Workflow not found.");

  const { data: occ, error: occErr } = await admin
    .from("workflow_occurrences")
    .insert({
      workflow_id: wf.id,
      occurrence_key: `test-${Date.now()}`,
      scheduled_for: new Date().toISOString(),
      status: "pending",
    })
    .select("id")
    .single();
  if (occErr) throw new Error(occErr.message);

  const { error: msgErr } = await admin.from("messages").insert({
    channel_id: wf.channel_id,
    author_id: null,
    body: wf.title,
    type: "workflow",
    workflow_occurrence_id: occ.id,
  });
  if (msgErr) throw new Error(msgErr.message);

  await admin.from("workflow_logs").insert({
    workflow_id: wf.id,
    occurrence_id: occ.id,
    status: "created",
    detail: "Manual test run",
  });

  revalidatePath(`/channels/${wf.channel_id}`);
  return { channelId: wf.channel_id as string };
}

export async function toggleWorkflowActive(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("workflows").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
}

export async function deleteWorkflow(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
}

// ---------------------------------------------------------------------------
// Invite users (admin only) — creates the account with a temporary password.
// Uses the service-role admin client (bypasses RLS, server-only).
// ---------------------------------------------------------------------------
export async function inviteUser(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") || "").trim();
  const fullName = String(formData.get("full_name") || "").trim();
  const role = (String(formData.get("role") || "member") as Role);
  const password = String(formData.get("password") || "");

  if (!email || !password) throw new Error("Email and a temporary password are required.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip the confirmation email for a private family app
    user_metadata: { full_name: fullName || email.split("@")[0], role },
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/invite");
  return { ok: true };
}
