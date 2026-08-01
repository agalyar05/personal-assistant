# Personal SMS Assistant (Vercel)

SMS personal assistant over Google Voice + Gmail, with a Next.js admin dashboard. Deployed on **Vercel**; cron hits `/api/cron/poll`. Storage is local `data/store.json` (dev) or **Supabase** (production).

This README is written so a **new agent or developer can continue work** without re-discovering the architecture.

---

## Product overview

**Inbound:** User texts a Google Voice number → Gmail receives the GV email → cron (or admin **Sync**) polls unread GV mail → Groq assistant handles the message → reply is sent back through the GV thread as SMS.

**Outbound:** Reminders, morning/weekly briefings, and proactive SMS use the same Gmail→GV path (`sendSms` / `sendSmsParts`).

**Admin (`/admin`):** Dashboard, Masterlist (assignments), Groups (classes), Applications, Lists, `.todo`, Reminders, Thinking sheet, Settings (cron window, theme, horizon, Sync).

---

## Stack

| Layer | Tech |
|-------|------|
| App | Next.js 15 (App Router), React 19, TypeScript, Tailwind 4 |
| AI | Groq (`src/lib/assistant/index.ts`) |
| SMS | Gmail API + Google Voice relay (`src/lib/sms/gmail.ts`) |
| Calendar / weather | Google Calendar API, Open-Meteo (`src/lib/weather.ts`) |
| DB | Supabase (Postgres) via `src/lib/db/index.ts`, or local JSON via `src/lib/db/local.ts` |
| Cron | External scheduler (e.g. cron-job.org) → `GET /api/cron/poll` with `Authorization: Bearer CRON_SECRET` |

Deploy: push to `main` → Vercel. Do not commit secrets (`.env.local`, `credentials.json`).

---

## Repo map (start here)

```
src/
  app/
    admin/           # UI pages (assignments = Masterlist, groups, todo, …)
    api/             # Route handlers (assignments, lists, cron/poll, settings, …)
  components/        # AssignmentSheet, ThemePicker, CelebrationBurst, …
  lib/
    assistant/       # Groq tools + SMS command handling
    sms/gmail.ts     # Poll inbox, send SMS, GV thread cache
    poll.ts          # Cron tick: inbox + reminders + briefings
    db/              # Supabase + local store
    masterlist-todo.ts  # Masterlist ↔ .todo checkbox sync
    app-sheet.ts     # Applications as synthetic Masterlist rows (`app:` ids)
    zoned-time.ts    # Wall-clock time in user timezone (reminders)
    types.ts         # Shared types + DEFAULT_SETTINGS
  middleware.ts      # Admin auth if configured
supabase/migrations/ # Run in order on Supabase (see below)
scripts/             # google-oauth.mjs, test-briefing.mjs, …
```

### Critical paths for most tasks

| Concern | Files |
|---------|--------|
| SMS poll / send | `src/lib/sms/gmail.ts`, `src/lib/poll.ts`, `src/app/api/cron/poll/route.ts`, `src/app/api/sms/sync/route.ts` |
| Assistant / tools | `src/lib/assistant/index.ts` |
| Reminders | `src/lib/reminders.ts`, `src/lib/zoned-time.ts` |
| Masterlist UI | `src/app/admin/assignments/page.tsx`, `src/components/AssignmentSheet.tsx` |
| Masterlist ↔ `.todo` | `src/lib/masterlist-todo.ts`, migrations `009` |
| Settings (slim vs full) | `src/app/api/settings/route.ts` — use `?slim=1` for theme/horizon (avoids Thinking sheet payload) |
| Themes / class tints | `src/lib/themes.ts` |

---

## Recent work (context for continuing)

Already shipped (roughly newest themes first):

1. **Perf (cron interval left alone)**
   - Gmail: cheap `is:unread` probe before full thread hydration; default `GMAIL_LOOKBACK_DAYS=1`
   - SMS: cache GV thread for `sendSms` / `sendSmsParts` (don’t re-search per part)
   - Masterlist: slim settings; avoid full reload after small edits; sheet lazy-loaded; class `<select>` only when editing; calendar indexed by day
2. **Row reorder flicker** — optimistic sortOrder + `bulkSave(..., { keepLocal: true })` so server response doesn’t clobber local order
3. **Masterlist ↔ `.todo`** — checkbox column; `todo_item_id` on assignments; done ↔ submitted sync (`009_assignment_todo.sql`)
4. **Masterlist UX** — sheet/agenda/calendar/kanban; class tints; fill-down; apps on sheet as `app:` rows; sort by class/due/progress
5. **Reminders** — timezone-correct due checks; ask “when?” if no time (`pendingReminderMessage`)
6. **Morning briefing** — calendar → due → weather (°F) → closer; multi-part SMS

### Known follow-ups / gotchas

- **Supabase migrations:** production must have run **all** of `001`…`009`. If Masterlist→`.todo` checkbox fails, run `009_assignment_todo.sql`.
- **`GMAIL_LOOKBACK_DAYS`:** code default is `1`. If Vercel still has `7` or `2`, update the env var.
- **Cron:** intentionally still ~1–2 min; use admin **Sync** for immediate inbox. Do not “optimize” by slowing cron unless the user asks.
- **Admin has no password** unless middleware/auth is configured — treat URL as secret.
- **GV delivery:** proactive SMS must reply inside an existing Voice thread; `GOOGLE_VOICE_REPLY_EMAIL` helps once known.
- **Local vs Supabase:** empty Supabase env → `data/store.json`. Vercel needs Supabase or data won’t persist across instances.
- **Sheet apps:** synthetic ids `app:{uuid}` (`src/lib/app-sheet.ts`). Don’t treat them as real assignment ids in the assignments API.

---

## Step-by-step setup

### 1. Install & run locally

```bash
cd ~/Desktop/personal-assistant
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 → `/admin`.

### 2. Required env

```
GROQ_API_KEY=gsk_...
PHONE_EMAIL=yournumber@carrier-gateway
CRON_SECRET=long-random-string
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

Generate cron secret: `openssl rand -hex 24`

### 3. Google OAuth

```bash
# credentials.json = Google Cloud Desktop OAuth client (same Gmail as Voice)
node scripts/google-oauth.mjs
# or: npm run google:oauth
```

Copy printed client id/secret/refresh token into `.env.local`. Re-run after password/2FA changes.

Scopes: Gmail modify/send + Calendar.

### 4. Optional but recommended

```
GOOGLE_VOICE_REPLY_EMAIL=gv….@txt.voice.google.com
TIMEZONE=America/Detroit
WEATHER_CITY=Detroit
GV_SEND_DELAY_MS=1500
GMAIL_LOOKBACK_DAYS=1
```

### 5. Supabase (production)

1. Create project at https://supabase.com  
2. SQL Editor → run migrations **in order**:

| File | Purpose |
|------|---------|
| `001_initial.sql` | Core settings, lists, reminders, processed messages |
| `002_assignments.sql` | Courses + assignments |
| `003_assignment_link.sql` | Assignment links |
| `004_assignment_status_na.sql` | `n_a` status |
| `005_list_difficulty.sql` | List item difficulty |
| `006_course_links.sql` | Course link JSON |
| `007_applications_goals.sql` | Applications / goals |
| `008_list_unassigned.sql` | Unassigned list difficulty |
| `009_assignment_todo.sql` | `assignments.todo_item_id` → `.todo` sync |

3. Env:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server only
```

### 6. Deploy

1. Push to GitHub → import on Vercel  
2. Copy **all** `.env.local` vars into Vercel  
3. Deploy (`main` auto-deploys)

### 7. Cron (cron-job.org or similar)

| Field | Value |
|--------|--------|
| URL | `https://YOUR-APP.vercel.app/api/cron/poll` |
| Schedule | every **1–2 minutes** |
| Method | GET |
| Header | `Authorization: Bearer YOUR_CRON_SECRET` |

App also gates with Settings → cron **window** (default ~07:00–24:00 user TZ). Outside the window, ticks are cheap no-ops.

### 8. Smoke test

1. Admin → **Sync inbox now**  
2. Text GV: `hey` → Sync or wait for cron  
3. `.todo buy milk` then `.todo`  
4. Masterlist: add row, toggle `.todo` checkbox, drag reorder (should not flicker)

---

## Env checklist

| Variable | Required | Notes |
|----------|----------|--------|
| `GROQ_API_KEY` | yes | Groq console |
| `PHONE_EMAIL` | yes | Carrier SMS gateway email |
| `GOOGLE_CLIENT_*` / `GOOGLE_REFRESH_TOKEN` | yes | OAuth script |
| `CRON_SECRET` | yes | Bearer for cron + protect poll |
| `GOOGLE_VOICE_REPLY_EMAIL` | recommended | Stable SMS delivery |
| `GMAIL_LOOKBACK_DAYS` | optional | Default **1** in code |
| `GV_SEND_DELAY_MS` | optional | Default 1500 between SMS parts |
| `TIMEZONE` / `WEATHER_CITY` | optional | Defaults Detroit |
| Supabase trio | yes on Vercel | Persistence |

---

## SMS shortcuts

| Text | Action |
|------|--------|
| `.todo item` / `.todo` | add / show list |
| `.groceries milk` | grocery list |
| `done 2` / `-milk` | check off |
| `remind me to…` | reminder (asks for time if missing) |
| `due today` / `due tomorrow` / `due this week` | Masterlist dues |
| `timezone America/Chicago` | timezone only |
| `I'm in Seattle now` | weather city + timezone |
| `quote` / `mlem` / `note: …` | shortcuts |

---

## How the poll tick works

`src/lib/poll.ts` (via `/api/cron/poll` or Sync):

1. Respect cron window / live override (`src/lib/cron-control.ts`)
2. `getIncomingTexts()` — unread probe → hydrate threads only if needed
3. For each inbound: assistant → `sendUserReply` on same thread → mark handled
4. Due reminders (`src/lib/reminders.ts` + zoned wall time)
5. Morning / weekly briefing if due (`sendSmsParts`)

---

## Agent working notes

- **Commits / PRs / pushes:** only when the user asks.
- **Don’t edit unrelated files** or drive-by refactors.
- **Typecheck:** `npx tsc --noEmit`
- **Prefer matching existing patterns** in `assignments/page.tsx` and `AssignmentSheet.tsx` for Masterlist work.
- **Settings:** prefer `GET /api/settings?slim=1` unless you need Thinking sheet / full dashboard layout.
- **Performance:** keep the unread-first Gmail path and GV thread cache; don’t reintroduce full 7-day thread hydration every tick.
- **Conversation history:** prior agent transcripts live under Cursor’s agent-transcripts for this project if you need deeper context.

### Suggested next improvements (not started unless asked)

- Extract Calendar/Kanban into separate modules for true code-splitting (sheet already uses `next/dynamic`)
- Persist GV thread id in settings across cold starts (in-memory cache already helps warm instances)
- Admin auth if the URL is no longer secret enough
- Broader calendar than primary for briefing (currently primary calendar)

---

## Cost notes (Hobby)

- Empty cron ticks outside the window return quickly  
- Real Gmail work mainly on unread / reminders / briefings  
- Prefer **Sync** for “right now”; don’t add browser-side Gmail polling
