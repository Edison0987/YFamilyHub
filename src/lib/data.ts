import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Attachment,
  Channel,
  Message,
  MessageWithMeta,
  Profile,
  Workflow,
  WorkflowOccurrence,
} from "@/lib/types";

/**
 * The signed-in user's profile, or null if not signed in / no profile.
 *
 * Wrapped in React's `cache()` so that calling it several times while rendering
 * one request (e.g. in both the layout and the page) only does ONE network
 * round-trip instead of repeating the auth + profile lookup each time.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
});

/** All family members (small list — used to render author names/avatars). */
export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("full_name");
  return (data as Profile[]) ?? [];
}

/** All channels, newest first. */
export async function getChannels(): Promise<Channel[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("channels").select("*").order("created_at");
  return (data as Channel[]) ?? [];
}

export async function getChannel(channelId: string): Promise<Channel | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("channels").select("*").eq("id", channelId).single();
  return (data as Channel) ?? null;
}

/**
 * Build the fully-decorated list of root messages for a channel.
 * We fetch the pieces separately and stitch them together in plain JS,
 * which keeps the queries simple and easy to follow.
 */
export async function getChannelMessages(channelId: string): Promise<MessageWithMeta[]> {
  const supabase = await createClient();

  // 1. Root messages (replies have a parent_id and are loaded in the thread panel).
  const { data: rawMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .is("parent_id", null)
    .order("created_at");

  const messages = (rawMessages as Message[]) ?? [];
  if (messages.length === 0) return [];

  return decorateMessages(messages);
}

/** Load a single root message plus all of its thread replies. */
export async function getThread(
  rootId: string,
): Promise<{ root: MessageWithMeta; replies: MessageWithMeta[] } | null> {
  const supabase = await createClient();

  const { data: rootRaw } = await supabase.from("messages").select("*").eq("id", rootId).single();
  if (!rootRaw) return null;

  const { data: repliesRaw } = await supabase
    .from("messages")
    .select("*")
    .eq("parent_id", rootId)
    .order("created_at");

  const [root] = await decorateMessages([rootRaw as Message]);
  const replies = await decorateMessages((repliesRaw as Message[]) ?? []);
  return { root, replies };
}

/** Shared helper: attach author, attachments, workflow occurrence, reply count. */
async function decorateMessages(messages: Message[]): Promise<MessageWithMeta[]> {
  const supabase = await createClient();
  const ids = messages.map((m) => m.id);
  const authorIds = [...new Set(messages.map((m) => m.author_id).filter(Boolean))] as string[];
  const occIds = [
    ...new Set(messages.map((m) => m.workflow_occurrence_id).filter(Boolean)),
  ] as string[];

  // Run the independent lookups in PARALLEL (one network round-trip each, but
  // all at once) instead of awaiting them one after another.
  const [authorsRes, attachmentsRes, occsRes, replyRes] = await Promise.all([
    authorIds.length
      ? supabase.from("profiles").select("*").in("id", authorIds)
      : Promise.resolve({ data: [] as Profile[] }),
    ids.length
      ? supabase.from("attachments").select("*").in("message_id", ids)
      : Promise.resolve({ data: [] as Attachment[] }),
    occIds.length
      ? supabase.from("workflow_occurrences").select("*").in("id", occIds)
      : Promise.resolve({ data: [] as WorkflowOccurrence[] }),
    ids.length
      ? supabase.from("messages").select("parent_id").in("parent_id", ids)
      : Promise.resolve({ data: [] as { parent_id: string }[] }),
  ]);

  // Authors
  const profilesById = new Map<string, Profile>();
  (authorsRes.data as Profile[] | null)?.forEach((p) => profilesById.set(p.id, p));

  // Attachments grouped by message
  const attByMessage = new Map<string, Attachment[]>();
  (attachmentsRes.data as Attachment[] | null)?.forEach((a) => {
    const list = attByMessage.get(a.message_id) ?? [];
    list.push(a);
    attByMessage.set(a.message_id, list);
  });

  // Workflow occurrences (+ their workflow). The workflows lookup depends on the
  // occurrences result, so it follows the parallel batch above.
  const occById = new Map<string, WorkflowOccurrence & { workflow: Workflow | null }>();
  const occs = (occsRes.data as WorkflowOccurrence[] | null) ?? [];
  if (occs.length) {
    const wfIds = [...new Set(occs.map((o) => o.workflow_id))];
    const wfById = new Map<string, Workflow>();
    const { data: wfs } = await supabase.from("workflows").select("*").in("id", wfIds);
    (wfs as Workflow[] | null)?.forEach((w) => wfById.set(w.id, w));
    occs.forEach((o) => occById.set(o.id, { ...o, workflow: wfById.get(o.workflow_id) ?? null }));
  }

  // Reply counts (how many messages have each of these as a parent)
  const replyCount = new Map<string, number>();
  (replyRes.data as { parent_id: string }[] | null)?.forEach((r) => {
    replyCount.set(r.parent_id, (replyCount.get(r.parent_id) ?? 0) + 1);
  });

  return messages.map((m) => ({
    ...m,
    author: m.author_id ? profilesById.get(m.author_id) ?? null : null,
    attachments: attByMessage.get(m.id) ?? [],
    occurrence: m.workflow_occurrence_id ? occById.get(m.workflow_occurrence_id) ?? null : null,
    reply_count: replyCount.get(m.id) ?? 0,
  }));
}

/** All workflows (for the management page). */
export async function getWorkflows(): Promise<Workflow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("workflows").select("*").order("created_at", { ascending: false });
  return (data as Workflow[]) ?? [];
}
