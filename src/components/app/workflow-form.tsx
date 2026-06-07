"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Channel, ScheduleType, Workflow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// One form for both "create" and "edit". The `action` prop is a server action.
export function WorkflowForm({
  channels,
  action,
  initial,
  submitLabel,
}: {
  channels: Channel[];
  action: (formData: FormData) => Promise<void>;
  initial?: Workflow;
  submitLabel: string;
}) {
  const router = useRouter();
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initial?.schedule_type ?? "daily");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData); // redirects to /workflows on success
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save workflow.");
      }
    });
  }

  return (
    <form action={onSubmit} className="max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={initial?.title} placeholder="e.g. Pay rent" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Message body</Label>
        <Textarea
          id="body"
          name="body"
          defaultValue={initial?.body ?? ""}
          placeholder="e.g. Pay rent for Shangri-La and post the receipt as a reply."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="channel_id">Channel</Label>
          <Select id="channel_id" name="channel_id" defaultValue={initial?.channel_id ?? ""} required>
            <option value="" disabled>
              Choose a channel…
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="schedule_type">Schedule</Label>
          <Select
            id="schedule_type"
            name="schedule_type"
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="once">Once (specific date)</option>
            <option value="cron">Custom (cron)</option>
          </Select>
        </div>
      </div>

      {/* Schedule-type-specific fields */}
      <div className="grid grid-cols-2 gap-4">
        {scheduleType === "weekly" ? (
          <div className="space-y-1.5">
            <Label htmlFor="day_of_week">Day of week</Label>
            <Select id="day_of_week" name="day_of_week" defaultValue={String(initial?.day_of_week ?? 1)}>
              {WEEKDAYS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {scheduleType === "monthly" ? (
          <div className="space-y-1.5">
            <Label htmlFor="day_of_month">Day of month (1–31)</Label>
            <Input
              id="day_of_month"
              name="day_of_month"
              type="number"
              min={1}
              max={31}
              defaultValue={initial?.day_of_month ?? 1}
            />
          </div>
        ) : null}

        {scheduleType === "once" ? (
          <div className="space-y-1.5">
            <Label htmlFor="run_date">Date</Label>
            <Input id="run_date" name="run_date" type="date" defaultValue={initial?.run_date ?? ""} />
          </div>
        ) : null}

        {scheduleType === "cron" ? (
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="cron_expr">Cron expression</Label>
            <Input
              id="cron_expr"
              name="cron_expr"
              defaultValue={initial?.cron_expr ?? ""}
              placeholder="0 9 * * 1-5  (9am on weekdays)"
            />
            <p className="text-xs text-muted-foreground">
              Standard 5-field cron. Best results when the cron job runs hourly or more often.
            </p>
          </div>
        ) : null}

        {scheduleType !== "cron" ? (
          <div className="space-y-1.5">
            <Label htmlFor="time_of_day">Time of day</Label>
            <Input
              id="time_of_day"
              name="time_of_day"
              type="time"
              defaultValue={initial?.time_of_day?.slice(0, 5) ?? "09:00"}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" defaultValue={initial?.timezone ?? "Asia/Manila"} />
        </div>

        <div className="flex items-end gap-2 pb-1.5">
          <input
            id="active"
            name="active"
            type="checkbox"
            defaultChecked={initial?.active ?? true}
            className="h-4 w-4"
          />
          <Label htmlFor="active">Active</Label>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/workflows")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
