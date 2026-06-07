import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { CronExpressionParser } from "cron-parser";
import type { Workflow } from "./types";

/**
 * The scheduling brain.
 *
 * Given a workflow and the current time, decide whether a reminder is "due"
 * right now and, if so, return a stable `occurrenceKey` plus the exact UTC
 * instant it was scheduled for.
 *
 * The `occurrenceKey` is what guarantees we never post the same reminder
 * twice: it is stored with a UNIQUE (workflow_id, occurrence_key) constraint,
 * so a second cron run for the same slot simply does nothing.
 */

export type DueResult =
  | { due: false }
  | { due: true; occurrenceKey: string; scheduledFor: Date };

// Number of hours after the scheduled time during which we will still create
// the occurrence. This gives the hourly cron some slack (e.g. a missed run).
const GRACE_HOURS = 26;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Parse a "HH:MM:SS" (or "HH:MM") time string into hours + minutes. */
function parseTime(time: string): { hh: number; mm: number } {
  const [hh = 0, mm = 0] = time.split(":").map((x) => parseInt(x, 10));
  return { hh, mm };
}

/**
 * Build the UTC instant for a given local wall-clock date+time in a timezone.
 * Passing a string avoids any ambiguity about the server's own timezone.
 */
function instantFor(
  year: number,
  monthIndex0: number, // 0-based month
  day: number,
  hh: number,
  mm: number,
  timezone: string,
): Date {
  const local = `${year}-${pad(monthIndex0 + 1)}-${pad(day)}T${pad(hh)}:${pad(
    mm,
  )}:00`;
  return fromZonedTime(local, timezone);
}

function withinGrace(scheduledFor: Date, now: Date): boolean {
  const diffMs = now.getTime() - scheduledFor.getTime();
  return diffMs >= 0 && diffMs <= GRACE_HOURS * 60 * 60 * 1000;
}

/** Days in the given month (monthIndex0 is 0-based). */
function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function isWorkflowDue(workflow: Workflow, now: Date = new Date()): DueResult {
  const tz = workflow.timezone || "Asia/Manila";
  const { hh, mm } = parseTime(workflow.time_of_day);

  // "now" expressed in the workflow's local timezone (its fields are local).
  const localNow = toZonedTime(now, tz);
  const y = localNow.getFullYear();
  const mIdx = localNow.getMonth();
  const d = localNow.getDate();
  const dow = localNow.getDay(); // 0=Sun..6=Sat

  switch (workflow.schedule_type) {
    case "daily": {
      const scheduledFor = instantFor(y, mIdx, d, hh, mm, tz);
      if (withinGrace(scheduledFor, now)) {
        return { due: true, occurrenceKey: `daily-${y}-${pad(mIdx + 1)}-${pad(d)}`, scheduledFor };
      }
      return { due: false };
    }

    case "weekly": {
      if (workflow.day_of_week === null || workflow.day_of_week !== dow) {
        return { due: false };
      }
      const scheduledFor = instantFor(y, mIdx, d, hh, mm, tz);
      if (withinGrace(scheduledFor, now)) {
        return { due: true, occurrenceKey: `weekly-${y}-${pad(mIdx + 1)}-${pad(d)}`, scheduledFor };
      }
      return { due: false };
    }

    case "monthly": {
      if (workflow.day_of_month === null) return { due: false };
      // Clamp e.g. "31" down to the last day of shorter months.
      const effectiveDay = Math.min(workflow.day_of_month, daysInMonth(y, mIdx));
      if (d !== effectiveDay) return { due: false };
      const scheduledFor = instantFor(y, mIdx, d, hh, mm, tz);
      if (withinGrace(scheduledFor, now)) {
        return { due: true, occurrenceKey: `monthly-${y}-${pad(mIdx + 1)}`, scheduledFor };
      }
      return { due: false };
    }

    case "once": {
      if (!workflow.run_date) return { due: false };
      const [ry, rm, rd] = workflow.run_date.split("-").map((x) => parseInt(x, 10));
      const scheduledFor = instantFor(ry, rm - 1, rd, hh, mm, tz);
      if (withinGrace(scheduledFor, now)) {
        return { due: true, occurrenceKey: `once-${workflow.run_date}`, scheduledFor };
      }
      return { due: false };
    }

    case "cron": {
      if (!workflow.cron_expr) return { due: false };
      try {
        const interval = CronExpressionParser.parse(workflow.cron_expr, {
          currentDate: now,
          tz,
        });
        // The most recent scheduled time at or before "now".
        const prev = interval.prev().toDate();
        if (withinGrace(prev, now)) {
          return { due: true, occurrenceKey: `cron-${prev.toISOString()}`, scheduledFor: prev };
        }
      } catch {
        // Invalid cron expression -> treat as not due.
      }
      return { due: false };
    }

    default:
      return { due: false };
  }
}

/** Human-readable description of a workflow's schedule (for the UI). */
export function describeSchedule(workflow: Workflow): string {
  const time = workflow.time_of_day.slice(0, 5);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  switch (workflow.schedule_type) {
    case "daily":
      return `Every day at ${time}`;
    case "weekly":
      return `Every ${days[workflow.day_of_week ?? 0]} at ${time}`;
    case "monthly":
      return `Day ${workflow.day_of_month} of each month at ${time}`;
    case "once":
      return `Once on ${workflow.run_date} at ${time}`;
    case "cron":
      return `Custom (${workflow.cron_expr})`;
    default:
      return "";
  }
}
