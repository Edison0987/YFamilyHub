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

// We create an occurrence when the workflow's MOST RECENT scheduled slot is
// within this many hours of "now". 26h comfortably covers a once-per-day cron
// (with a little slack), so each daily/weekly/monthly slot is caught exactly
// once and never duplicated — the next day the slot is older than 26h and is
// skipped. (With a more frequent cron it still works the same way.)
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

  switch (workflow.schedule_type) {
    case "daily": {
      // Today's slot if it has already passed, otherwise yesterday's.
      let slotY = y, slotM = mIdx, slotD = d;
      let scheduledFor = instantFor(slotY, slotM, slotD, hh, mm, tz);
      if (now < scheduledFor) {
        const yest = new Date(localNow);
        yest.setDate(yest.getDate() - 1);
        slotY = yest.getFullYear();
        slotM = yest.getMonth();
        slotD = yest.getDate();
        scheduledFor = instantFor(slotY, slotM, slotD, hh, mm, tz);
      }
      if (withinGrace(scheduledFor, now)) {
        return {
          due: true,
          occurrenceKey: `daily-${slotY}-${pad(slotM + 1)}-${pad(slotD)}`,
          scheduledFor,
        };
      }
      return { due: false };
    }

    case "weekly": {
      if (workflow.day_of_week === null) return { due: false };
      // Walk back up to 7 days to find the most recent matching weekday whose
      // time-of-day has already passed.
      for (let back = 0; back <= 7; back++) {
        const day = new Date(localNow);
        day.setDate(day.getDate() - back);
        if (day.getDay() !== workflow.day_of_week) continue;
        const scheduledFor = instantFor(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          hh,
          mm,
          tz,
        );
        if (now < scheduledFor) continue; // hasn't happened yet today; keep looking back
        if (withinGrace(scheduledFor, now)) {
          return {
            due: true,
            occurrenceKey: `weekly-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
            scheduledFor,
          };
        }
        break;
      }
      return { due: false };
    }

    case "monthly": {
      if (workflow.day_of_month === null) return { due: false };
      // This month's slot (day clamped to month length) if passed, else last month's.
      let slotY = y, slotM = mIdx;
      let effectiveDay = Math.min(workflow.day_of_month, daysInMonth(slotY, slotM));
      let scheduledFor = instantFor(slotY, slotM, effectiveDay, hh, mm, tz);
      if (now < scheduledFor) {
        slotM -= 1;
        if (slotM < 0) {
          slotM = 11;
          slotY -= 1;
        }
        effectiveDay = Math.min(workflow.day_of_month, daysInMonth(slotY, slotM));
        scheduledFor = instantFor(slotY, slotM, effectiveDay, hh, mm, tz);
      }
      if (withinGrace(scheduledFor, now)) {
        return { due: true, occurrenceKey: `monthly-${slotY}-${pad(slotM + 1)}`, scheduledFor };
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
