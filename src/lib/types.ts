// Shared TypeScript types for the app's data shapes.
// These mirror the columns in supabase/schema.sql.

export type Role = "admin" | "member";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  timezone: string;
  created_at: string;
};

export type Channel = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  lock_code_hash: string | null;
};

export type ScheduleType = "daily" | "weekly" | "monthly" | "once" | "cron";

export type Workflow = {
  id: string;
  title: string;
  body: string | null;
  channel_id: string;
  schedule_type: ScheduleType;
  time_of_day: string; // "HH:MM:SS"
  timezone: string;
  day_of_week: number | null;
  day_of_month: number | null;
  run_date: string | null;
  cron_expr: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  last_run_at: string | null;
};

export type OccurrenceStatus = "pending" | "done";

export type WorkflowOccurrence = {
  id: string;
  workflow_id: string;
  scheduled_for: string;
  occurrence_key: string;
  status: OccurrenceStatus;
  done_by: string | null;
  done_at: string | null;
  created_at: string;
};

export type Attachment = {
  id: string;
  message_id: string;
  uploaded_by: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type MessageType = "user" | "workflow";

export type Message = {
  id: string;
  channel_id: string;
  parent_id: string | null;
  author_id: string | null;
  body: string | null;
  type: MessageType;
  workflow_occurrence_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

// A message joined with the data the UI needs to render it.
export type MessageWithMeta = Message & {
  author: Profile | null;
  attachments: Attachment[];
  occurrence: (WorkflowOccurrence & { workflow: Workflow | null }) | null;
  reply_count: number;
};
