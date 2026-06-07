# Family Hub

A private, Slack-style web app for a family: channels, messages with file/image
attachments, threaded replies, and **automated recurring workflow reminders**
with a per-occurrence **DONE** button.

Built with **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
style components + Supabase** (Auth, Postgres, Storage, Realtime). Deployable to
**Vercel** with a Cron job that powers the workflow engine.

---

## 1. What you get

- 🔐 **Invite-only auth** (email + password). Roles: `admin` / `member`.
- 💬 **Channels & messages** with image/file uploads and threaded replies.
- 🔁 **Recurring workflows** (daily / weekly / monthly / once / custom cron) that
  auto-post a reminder into a channel.
- ✅ **DONE button** per occurrence — June's "Pay rent" and July's are tracked
  separately. Shows _"Done by [name] at [time]"_, with reopen.
- 📎 **Reply with proof** — attach images/files under any workflow reminder.
- ⚡ **Realtime** updates (new messages + DONE status) via Supabase Realtime.
- 🌙 Dark mode by default.

---

## 2. Prerequisites

- Node.js 20.9+ (you have it)
- A free [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (for deployment)

---

## 3. Set up Supabase

1. Create a new project at https://supabase.com.
2. Open **SQL Editor** → **New query**, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and **Run**. This creates all
   tables, security rules (RLS), the storage bucket, and realtime setup.
3. Get your keys from **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, server-only)

> **Auth note:** This app creates accounts with email + password and skips email
> confirmation (good for a private family app). No SMTP setup needed.

---

## 4. Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://YOUR-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"   # server only
CRON_SECRET="a-long-random-string"                  # protects the cron route
```

Generate a `CRON_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## 5. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Create your first admin

1. You can't sign up from the UI (invite-only). Create the first user in the
   Supabase dashboard: **Authentication → Users → Add user** (set email +
   password, tick _Auto Confirm User_).
2. Promote yourself to admin in **SQL Editor**:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

3. Sign in. As an admin you can now create channels, workflows, and invite the
   rest of the family from **Invite members** in the sidebar.

---

## 6. How the workflow engine works

- Admins define workflows (title, body, channel, schedule, time, timezone).
- The cron route [`/api/cron/run-workflows`](src/app/api/cron/run-workflows/route.ts)
  runs on a schedule. For each active workflow it asks
  [`isWorkflowDue()`](src/lib/schedule.ts) whether a reminder is due _now_.
- If due, it inserts a `workflow_occurrences` row (with a UNIQUE key per slot,
  so **no duplicates**) and posts a `type='workflow'` message into the channel.
- Each occurrence carries its **own** DONE status, so every run is independent.

### Trigger it manually (for testing)

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/run-workflows
```

Tip: set a workflow to `daily` with a `time_of_day` a couple minutes in the past
(in `Asia/Manila`) and hit the endpoint — the reminder appears in the channel.

---

## 7. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project → Import** the repo. The **Root Directory**
   should be the project folder (where `package.json` is).
3. Add the **Environment Variables** (same four as `.env.local`) under
   **Settings → Environment Variables** (Production + Preview).
4. Deploy. Vercel reads [`vercel.json`](vercel.json) and registers the cron job:

   ```json
   { "crons": [{ "path": "/api/cron/run-workflows", "schedule": "0 * * * *" }] }
   ```

   - Vercel automatically calls the cron path with the `CRON_SECRET` as a Bearer
     token, which the route verifies.
   - **Hobby plan:** cron jobs run **once per day**. For hourly reminders use the
     **Pro plan** (the `0 * * * *` schedule above runs hourly there). You can also
     change the schedule string to fit your plan.
5. Done. Visit your Vercel URL and sign in.

---

## 8. Project structure

```
supabase/schema.sql              ← run this in Supabase first
src/
  proxy.ts                       ← session refresh + route guard (was "middleware")
  lib/
    supabase/{client,server,middleware}.ts
    schedule.ts                  ← "is this workflow due?" + cron parsing
    data.ts                      ← server-side data fetching
    actions.ts                   ← server actions (mutations)
    upload.ts                    ← browser → Supabase Storage
  components/ui/                 ← shadcn/ui-style primitives
  components/app/                ← sidebar, channel view, composer, workflow card…
  app/
    login/                       ← login page
    (app)/                       ← authenticated shell + pages
      channels/[id]/             ← channel view
      workflows/                 ← manage / create / edit
      admin/invite/              ← admin invites members
    api/cron/run-workflows/      ← the workflow engine
```

---

## 9. Acceptance criteria → where it lives

| Requirement | Where |
| --- | --- |
| Log in | `app/login`, `lib/supabase`, `proxy.ts` |
| Create channels | `components/app/create-channel-dialog.tsx`, `createChannel` |
| Send messages | `message-composer.tsx`, `sendMessage` |
| Upload image/file | `lib/upload.ts`, `attachments` table |
| Create recurring workflow | `workflow-form.tsx`, `createWorkflow` |
| Auto-post to channel | `api/cron/run-workflows/route.ts` |
| DONE button + status for all | `workflow-message.tsx`, `setOccurrenceDone`, Realtime |
| Reply with attachments | `thread-panel.tsx` |
| Deployable to Vercel | `vercel.json`, this README |
