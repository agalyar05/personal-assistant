# Personal SMS Assistant — Agent Handoff README

This document is the primary onboarding guide for a **new agent or developer** continuing work on this repo. Read it before touching code.

---

## What this is

A personal SMS assistant that runs on **Vercel** (Next.js 15). The user texts a **Google Voice** number; messages arrive in **Gmail** as email; the app polls Gmail, runs a **Groq** LLM assistant, and replies via the same Google Voice thread as SMS.

There is also a web **admin dashboard** at `/admin` for lists, reminders, assignments (Masterlist), classes (Groups), applications, themes, and manual inbox sync.

**Repo:** `personal-assistant` on GitHub → auto-deploys to Vercel on push to `main`.

**Local path (owner's machine):** `/Users/agalya/Desktop/personal-assistant`

---

## Architecture

```
User phone
    ↓ SMS
Google Voice
    ↓ email relay
Gmail inbox (same Google account as OAuth)
    ↓ poll every 1–2 min OR admin "Sync inbox"
/api/cron/poll  or  /api/sms/sync
    ↓
src/lib/poll.ts
    ├─ getIncomingTexts()     ← src/lib/sms/gmail.ts
    ├─ getReply()               ← src/lib/assistant/index.ts (Groq + shortcuts)
    ├─ sendUserReply()          ← reply in GV thread
    ├─ due reminders            ← src/lib/reminders.ts
    └─ morning briefing         ← calendar + due + weather SMS parts
    ↓
Supabase (production) or data/store.json (local dev)
```

**Outbound SMS** (reminders, briefings): `sendSms` / `sendSmsParts` in `gmail.ts` — must reply inside an existing GV thread or SMS may not deliver.

**Cron:** External scheduler (cron-job.org) hits `GET /api/cron/poll` with `Authorization: Bearer CRON_SECRET`. App also gates by cron window in Settings (default ~07:00–24:00). Outside window = cheap no-op.

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4, CSS variables from theme |
| AI | Groq `llama-3.3-70b-versatile` |
| SMS transport | Gmail API → Google Voice relay |
| Calendar | Google Calendar API (`primary` calendar) |
| Weather | Open-Meteo (Fahrenheit) |
| Database | Supabase Postgres **or** local `data/store.json` |
| Deploy | Vercel (push `main`) |

**Scripts:** `npm run dev`, `npm run build`, `npm run google:oauth`, `node scripts/test-briefing.mjs`

**Typecheck:** `npx tsc --noEmit` (build also runs ESLint — `prefer-const` etc. will fail Vercel deploy)

---

## Repo map

```
src/
  app/
    page.tsx                    # redirects / → /admin
    admin/
      page.tsx                  # dashboard (widgets, sync button)
      assignments/page.tsx      # Masterlist — sheet/calendar/kanban/agenda/progress
      groups/page.tsx           # Classes + color swatches
      applications/page.tsx     # Scholarships/jobs deadlines
      todo/page.tsx             # .todo list (kanban by difficulty)
      lists/page.tsx            # Manage dot-lists
      reminders/page.tsx        # SMS reminders
      thinking/page.tsx         # Thinking spreadsheet
      settings/page.tsx         # Cron, theme, horizon, live mode
      layout.tsx                # Nav + ThemePicker
    api/
      cron/poll/route.ts        # Cron endpoint (Bearer auth)
      sms/sync/route.ts         # Manual sync (POST, no auth — admin only)
      settings/route.ts         # GET/PUT settings (?slim=1 for lightweight)
      assignments/route.ts      # GET/POST assignments + bulk + todo action
      courses/route.ts          # GET/POST groups/classes
      applications/route.ts     # GET/POST applications
      lists/route.ts            # GET/POST list items + create/rename/delete list
      reminders/route.ts        # GET/POST reminders
      thinking/route.ts         # GET/PUT thinking sheet cells
      admin/bootstrap/route.ts  # Initial data seed
  components/
    AssignmentSheet.tsx         # Spreadsheet UI (big file ~1400 lines)
    ThemePicker.tsx             # Theme context + slim settings fetch
    CelebrationBurst.tsx          # Confetti on submit
  lib/
    assistant/index.ts          # Groq tools + SMS shortcut parser
    sms/gmail.ts                # Gmail poll, send, GV thread cache
    poll.ts                       # Cron cycle orchestration
    reminders.ts                  # Due reminder logic
    lists.ts                      # List formatting, grocery aisles
    assignments.ts                # Due summary for SMS/briefing
    masterlist-todo.ts            # Masterlist ↔ .todo sync
    app-sheet.ts                  # Applications as synthetic sheet rows
    themes.ts                     # Theme presets + class color palette
    zoned-time.ts                 # Wall-clock time in user TZ
    courses.ts                    # Applications group constant
    types.ts                      # All shared types + DEFAULT_SETTINGS
    db/
      index.ts                    # Supabase + local router
      local.ts                    # JSON file store
supabase/migrations/001–009.sql   # Run in order on Supabase
scripts/
  google-oauth.mjs                # One-time OAuth token setup
  test-briefing.mjs               # Test morning briefing locally
.env.example                      # Env template (no secrets)
data/store.json                   # Local dev storage (gitignored)
```

---

## Admin pages

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard widgets, **Sync inbox now**, shortcuts |
| `/admin/assignments` | **Masterlist** — Sheet, Agenda, Calendar, Kanban, Progress views |
| `/admin/groups` | **Classes** (courses) with color chips; built-in Applications group |
| `/admin/applications` | Scholarship/job/internship tracker |
| `/admin/todo` | `.todo` list with difficulty kanban |
| `/admin/lists` | Create/rename/delete dot-lists |
| `/admin/reminders` | View/edit SMS reminders |
| `/admin/thinking` | Personal thinking spreadsheet |
| `/admin/settings` | Timezone, cron window, theme, task horizon, live mode |

**Security:** Admin has **no login** by default. Anyone with the URL can access it. Treat the URL as secret.

---

## API routes (quick reference)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/cron/poll` | Cron tick; requires `Authorization: Bearer CRON_SECRET` |
| POST | `/api/sms/sync` | Force poll; returns `{ ok, replies, skipped, reason }` |
| GET | `/api/settings` | Full settings; use `?slim=1` for theme/cron/horizon only |
| PUT | `/api/settings` | Update settings |
| GET | `/api/assignments` | `{ assignments, courses }` |
| POST | `/api/assignments` | Upsert; actions: `delete`, `bulk`, `todo` |
| GET/POST | `/api/courses` | Groups/classes |
| GET/POST | `/api/applications` | Applications |
| GET/POST | `/api/lists` | List items; actions: `create`, `rename`, `delete`, `clear`, `update`, `remove` |
| GET/POST | `/api/reminders` | Reminders |
| GET/PUT | `/api/thinking` | Thinking sheet |

---

## Data model (core types)

All types in `src/lib/types.ts`. Key entities:

### Settings (`AppSettings`)
- `timezone`, `weatherCity`, `morningBriefingTime`, `weeklyBriefingDay/Time`
- `googleVoiceReply` — cached GV relay address
- `cronControl` — mode (`off`/`always`/`window`), window times, `liveUntil`
- `uiTheme` — preset or custom colors
- `listCatalog` — known list names (e.g. `todo`, `groceries`, `notes`, `bhangra`)
- `dashboardLayout`, `thinkingSheet`
- `taskHorizonDays` — Masterlist sheet/agenda/kanban horizon (calendar shows all)
- `pendingReminderMessage` — waiting for user to specify reminder time

### Course (Group/Class)
- `id`, `name`, `code`, `color`, `professor`, `schedule`, `links[]`, `sortOrder`
- Built-in **Applications** group: `code === "APPS"` — do not delete

### Assignment (Masterlist row)
- `courseId`, `title`, `status`, `dueAt`, `assignmentType`, `difficulty`
- `pointsEarned/Possible`, `notes`, `link`, `sortOrder`
- `todoItemId` — linked `.todo` list item (migration 009)
- `dueReminderSentFor`

### Application
- Scholarship/job tracker; appears on Masterlist calendar/agenda and as synthetic sheet rows

### ListItem
- `listName`, `text`, `checked`, `difficulty` (`unassigned`/`easy`/`medium`/`hard`)

### Reminder
- `message`, `remindAt`, `frequency`, `fireTime`, `sent`, `snoozedUntil`

---

## SMS behavior

### How inbound works

1. `getIncomingTexts()` in `gmail.ts`:
   - Cheap probe: any `(unread OR not labeled assistant-handled)` GV mail in lookback window
   - Collect thread IDs, hydrate in parallel
   - `findUnansweredInbounds()` — every inbound after last bot reply in thread
   - Extract SMS text via `extractInboundSmsText()` (strips GV boilerplate)
2. `getReply()` in `assistant/index.ts`:
   - First tries **fast-path shortcuts** (regex, no LLM)
   - Else Groq with tool calls
3. Reply sent on same thread; message marked `assistant-handled` + stored in `processedMessages`

### List commands (important)

Lists use a **dot prefix**. Adding to a list **auto-creates** it if new.

| Text | Behavior |
|------|----------|
| `.todo buy milk` | Add "buy milk" to `.todo` |
| `.todo` | Show `.todo` list |
| `.left xyz` | Add "xyz" to `.left` (creates list on first use) |
| `.groceries milk, eggs` | Add to groceries (aisle-sorted display) |
| `done 2` | Check off item #2 on default grocery list |
| `done milk on .todo` | Check off by name on specific list |
| `- milk` | Check off from groceries |
| `what's left on .groceries` | Show list |

**Implementation:** `src/lib/assistant/index.ts` lines ~183–194 (regex shortcuts) + Groq tools `add_to_list`, `get_list`, `check_off_list_item`, `clear_list`. List names normalized in `src/lib/lists.ts` (`normalizeListName` strips leading dot).

**Default lists in catalog:** `todo`, `groceries`, `notes`, `bhangra` — but any `.name` works via SMS.

### Other SMS shortcuts

| Text | Behavior |
|------|--------|
| `remind me to …` | Schedule reminder; asks "When?" if no time |
| `due today` / `due tomorrow` / `due this week` | Masterlist due summary |
| `timezone America/Chicago` | Set timezone |
| `I'm in Seattle now` | Set weather city + timezone |
| `note: …` | Append timestamped note to `.notes` |
| `quote` / `mlem` | Fun shortcuts |
| General chat | Groq assistant with tools |

### Groq tools (assistant)

Defined in `src/lib/assistant/index.ts`: `get_list`, `add_to_list`, `clear_list`, `check_off_list_item`, `schedule_reminder`, `schedule_recurring_reminder`, `list_reminders`, `cancel_reminder`, `snooze_reminder`, `get_weather`, `get_quote`, `set_timezone`, `set_location`, `set_morning_briefing_time`, `get_events_for_day`, `create_calendar_event`.

**Model:** `llama-3.3-70b-versatile`

**Reminder rule:** If user wants a reminder but gives no time, assistant must ask — do NOT call `schedule_reminder` without a time. Uses `pendingReminderMessage` in settings for follow-up.

---

## Masterlist (`/admin/assignments`)

The assignments page was renamed **Masterlist** in the UI. Five views:

| View | Data source | Notes |
|------|-------------|-------|
| Sheet | `sheetRows` | Spreadsheet via `AssignmentSheet` (lazy-loaded) |
| Agenda | `horizonAssignments` + apps | Due soon list |
| Calendar | All assignments + open apps | Drag to reschedule; indexed by day |
| Kanban | `sheetRows` | By status/class/difficulty |
| Progress | All assignments | Stats by class |

### Sheet rows composition
- Real assignments + **synthetic application rows**
- App rows use id prefix `app:{uuid}` (`src/lib/app-sheet.ts`)
- **Never** POST app ids to `/api/assignments` — route through applications API
- Sheet sorted by `sortOrder` (manual drag reorder persists via bulk save)

### Masterlist ↔ `.todo` sync
- Checkbox column on sheet toggles `.todo` membership
- `assignments.todo_item_id` → `list_items.id` (migration **009**)
- Checking off on `.todo` can mark assignment submitted (`masterlist-todo.ts`)
- Requires migration 009 in Supabase if checkbox fails

### Performance patterns (don't regress)
- Settings: `GET /api/settings?slim=1` (not full settings with Thinking sheet)
- After edits: optimistic local state; `bulkSave(..., { keepLocal: true })` on reorder
- Sheet view: `next/dynamic` import
- Calendar: `useMemo` Maps for assignments/apps by day
- Class column: text until click, then `<select>`

### Task horizon
- `taskHorizonDays` in settings filters sheet/agenda/kanban
- Calendar always shows all items regardless of horizon

---

## Groups / class colors (`/admin/groups`)

- Each class has a `color` hex stored in DB
- **Palette logic** in `src/lib/themes.ts`:
  - `classSwatchPalette()` — shows each class's current color + a few unused suggestions
  - `nextUnusedClassColor()` — new class gets color at **either end** of hue range already in use (existing colors never shift)
  - Theme-tuned hue bands per preset (harbor/meadow/sunset/slate)
- Row tints across Masterlist use `faintClassTint(hex)` from same file
- Applications group is built-in (`APPS` code) — editable color, not deletable

---

## Gmail polling (critical — read before changing)

File: `src/lib/sms/gmail.ts`

**Lookback:** `GMAIL_LOOKBACK_DAYS` env, default **1** day in code.

**Probe:** `hasInboundCandidates()` — checks for unread OR not-yet-`assistant-handled` GV mail. Do NOT revert to unread-only — Gmail often auto-marks Voice emails as read before cron runs (caused "0 replies" on Sync).

**Handled label:** `assistant-handled` — applied after successful reply. Label ID cached in memory.

**GV thread cache:** 15-min in-memory cache for proactive SMS (`sendSmsParts`) so briefing/reminder bursts don't re-search Gmail every part.

**Env vars:** `PHONE_EMAIL` (carrier gateway, e.g. `2486675992@tmomail.net`), `GOOGLE_VOICE_REPLY_EMAIL` (recommended once known).

---

## Morning briefing

`src/lib/poll.ts` → `maybeMorningBriefing()`

**Order (3 SMS parts):**
1. Calendar events today (Google Calendar primary, up to 15)
2. Due today summary
3. Weather (°F) + rotating closer line

**Schedule:** `morningBriefingTime` in settings; once per day tracked via `lastMorningBriefing`.

**Test locally:** `node scripts/test-briefing.mjs`

---

## Reminders

File: `src/lib/reminders.ts` + `src/lib/zoned-time.ts`

- Due checks use **wall-clock time in user's timezone** (not UTC bugs)
- Past one-time times rejected
- If SMS reminder has no time → ask user, store `pendingReminderMessage`
- Fired-early reminders marked `sent` so they don't linger on Reminders page

---

## Database layer

`src/lib/db/index.ts` routes to Supabase or `local.ts` based on env:

```
NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → Supabase
(empty) → data/store.json
```

**Important:** Vercel serverless **requires Supabase** — local JSON won't persist across instances.

All CRUD goes through `db.*` functions — don't query Supabase directly from UI.

---

## Supabase migrations (run in order)

| # | File | What it adds |
|---|------|--------------|
| 001 | `001_initial.sql` | settings, list_items, reminders, processed_messages |
| 002 | `002_assignments.sql` | courses, assignments |
| 003 | `003_assignment_link.sql` | assignment link column |
| 004 | `004_assignment_status_na.sql` | `n_a` status |
| 005 | `005_list_difficulty.sql` | list item difficulty |
| 006 | `006_course_links.sql` | course links JSON |
| 007 | `007_applications_goals.sql` | applications table |
| 008 | `008_list_unassigned.sql` | unassigned difficulty |
| 009 | `009_assignment_todo.sql` | `assignments.todo_item_id` FK → list_items |

If Masterlist `.todo` checkbox fails in production, migration 009 likely wasn't run.

---

## Environment variables

### Required

```
GROQ_API_KEY=gsk_...
PHONE_EMAIL=2486675992@tmomail.net    # 10-digit US number @ carrier gateway
CRON_SECRET=long-random-string
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...              # from scripts/google-oauth.mjs
```

### Recommended

```
GOOGLE_VOICE_REPLY_EMAIL=xxx.yyy@txt.voice.google.com
TIMEZONE=America/Detroit
WEATHER_CITY=Detroit
GMAIL_LOOKBACK_DAYS=1
GV_SEND_DELAY_MS=1500
```

### Supabase (production)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...         # server only, never in browser
```

Generate cron secret: `openssl rand -hex 24`

**Never commit:** `.env.local`, `credentials.json`, service role key.

---

## Setup (from scratch)

```bash
cd ~/Desktop/personal-assistant
cp .env.example .env.local
# fill env vars
npm install
npm run dev
# → http://localhost:3000/admin
```

**Google OAuth:**
```bash
cp ~/path/to/credentials.json ./credentials.json
node scripts/google-oauth.mjs
# copy printed tokens to .env.local
```

**Deploy:**
1. Push to GitHub `main`
2. Vercel imports repo, add all env vars
3. cron-job.org → `GET https://YOUR-APP.vercel.app/api/cron/poll` every 1–2 min with Bearer header

**Smoke test:**
1. Admin → Sync inbox now
2. Text GV: `hey` → should reply
3. `.left test item` → should confirm add to `.left`
4. `.left` → should show list
5. Masterlist: add row, drag reorder, toggle `.todo` checkbox

---

## Recent commit history (context)

Latest commits on `main` (newest first):

```
38ea3d4 Fix inbox poll missing read-but-unhandled Google Voice texts
1766d93 Fix prefer-const lint that broke the Vercel build
276efef Cut Gmail/Masterlist churn and stabilize class colors
845c9e1 Tint Masterlist views by class, link rows to .todo, fix fill-down
b7880f7 Ask when to send a reminder if no time given
b0ba4f0 Fix reminder timezone due checks
3a75910 Morning briefing: warmer copy, Fahrenheit weather
77ab32b Masterlist sheet sorting by class/due/progress
6069aa0 Mute class palette, class dropdown on edit, row tints
acbd09c Morning briefing: timezone fix, split SMS parts
25880ff Applications on Masterlist sheet/kanban
```

---

## Known gotchas & debugging

### "Sync inbox" returns 0 replies
1. Check Gmail — is the GV email there? Unread or read?
2. Check `PHONE_EMAIL` matches user's number
3. Check OAuth refresh token valid (re-run oauth script)
4. Check `GMAIL_LOOKBACK_DAYS` — message must be within window
5. Message may already be labeled `assistant-handled` or in `processedMessages`
6. Check Vercel function logs for `Found N message(s) needing reply`

### SMS not delivering (outbound)
- Proactive texts must use existing GV thread (`findLatestVoiceThread`)
- Set `GOOGLE_VOICE_REPLY_EMAIL` once known from first inbound
- Long texts split via `sendSmsParts` with 1.5s delay

### Masterlist row reorder flickers
- Fixed: optimistic `sortOrder` + `bulkSave(..., { keepLocal: true })`
- Don't replace full assignments array from partial bulk response

### Vercel build fails on ESLint
- `prefer-const`, unused vars are **errors** in production build
- Run `npm run build` locally before pushing

### `.todo` checkbox doesn't work
- Run Supabase migration `009_assignment_todo.sql`

### Group color not showing as selected
- Fixed: `classSwatchPalette` includes stored colors; `hexesEqual` for match

### Cron running but no work
- Check Settings → cron mode/window
- "Live" mode (`liveUntil`) overrides window temporarily
- Outside window: `{ skipped: true, reason: "..." }`

---

## Agent working rules

1. **Only commit/push when the user asks.**
2. **Minimize scope** — smallest correct diff; no drive-by refactors.
3. **Match existing patterns** — read surrounding code before adding.
4. **Typecheck:** `npx tsc --noEmit`; **build:** `npm run build` before push.
5. **Settings:** use `?slim=1` unless you need Thinking sheet.
6. **Don't slow cron** unless user asks — use Sync for immediate inbox.
7. **Don't revert Gmail perf fixes** — unread + unhandled probe, thread cache, lookback=1.
8. **Supabase migrations** — remind user to run new ones in SQL editor.
9. **Admin has no auth** — don't expose secrets in client code.

---

## Suggested next work (not started unless asked)

- Admin authentication (URL is currently public)
- Persist GV thread id in settings (survive cold starts)
- Extract Calendar/Kanban from assignments page into separate modules
- Briefing: support multiple calendars (not just primary)
- Weekly briefing (schema exists, verify implementation)
- `.left` and custom lists UI on admin Lists page (SMS already works)
- Tests for `zoned-time.ts`, list normalization, Gmail text extraction

---

## File index (grep starting points)

| Task | Start here |
|------|------------|
| Fix SMS not replying | `src/lib/sms/gmail.ts`, `src/lib/poll.ts` |
| Add SMS command | `src/lib/assistant/index.ts` (shortcuts + tools) |
| Masterlist sheet bug | `src/components/AssignmentSheet.tsx` |
| Masterlist page logic | `src/app/admin/assignments/page.tsx` |
| Class colors | `src/lib/themes.ts`, `src/app/admin/groups/page.tsx` |
| Reminder bug | `src/lib/reminders.ts`, `src/lib/zoned-time.ts` |
| New API endpoint | `src/app/api/*/route.ts` + `src/lib/db/index.ts` |
| New admin page | `src/app/admin/*/page.tsx` + nav in `layout.tsx` |
| DB schema change | `supabase/migrations/0XX_*.sql` + types + db layer |
| Theme/styling | `src/lib/themes.ts`, `src/app/globals.css` |

---

## Cost notes (Vercel Hobby)

- Cron ticks outside window return immediately (minimal compute)
- Gmail work only when candidates exist or reminders/briefings due
- No browser-side Gmail polling — use Sync button
- Thinking sheet / dashboard images can be large — slim settings avoids shipping them on every fetch
