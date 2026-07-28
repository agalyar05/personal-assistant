# Personal SMS Assistant (Vercel)

Replaces the old GitHub Actions bot. Same SMS features (lists, reminders, Groq AI, briefings), hosted on **Vercel** with a web dashboard and **cron windows** so you don’t burn Actions minutes.

## What you get

- Text your Google Voice number → bot replies (same as before)
- Web admin: lists, reminders, cron settings, Sync inbox
- Cron: external scheduler hits `/api/cron/poll` (gated 7am–midnight by default)
- Storage: local `data/store.json` for first tests, or Supabase in production

---

## Step-by-step setup

### 1. Install & run locally

```bash
cd ~/Desktop/personal-assistant
cp .env.example .env.local
npm install
```

Fill `.env.local` as you go through the steps below.

```bash
npm run dev
```

Open http://localhost:3000 → `/admin`.

---

### 2. Groq API key

1. Go to https://console.groq.com → API Keys  
2. Create a key  
3. Put it in `.env.local`:

```
GROQ_API_KEY=gsk_...
```

(Same key you used for the old bot is fine.)

---

### 3. Phone email

Your carrier SMS gateway for matching inbound texts:

```
PHONE_EMAIL=2486675992@tmomail.net
```

(Use your real number@carrier gateway.)

---

### 4. Google OAuth (Gmail + Calendar)

You already have `credentials.json` from the old Python bot (Google Cloud Desktop client).

1. Copy it into this project root:

```bash
cp ~/Desktop/text-assistant/credentials.json ~/Desktop/personal-assistant/credentials.json
```

2. Run:

```bash
node scripts/google-oauth.mjs
```

3. Sign in as the **same Gmail** tied to Google Voice  
4. Copy the printed values into `.env.local`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

**Important:** After password / 2FA changes, re-run this script and update the refresh token.

Scopes used: Gmail modify/send + Calendar.

---

### 5. Cron secret

Used later so only your scheduler can hit the poll endpoint:

```
CRON_SECRET=long-random-string-here
```

Generate a random secret:

```bash
openssl rand -hex 24
```

The admin dashboard has no password — anyone with the URL can open it.

---

### 6. Optional: Supabase (recommended for Vercel)

Local mode uses `data/store.json` (fine for laptop; **not** durable across Vercel serverless instances).

For production:

1. Create a free project at https://supabase.com  
2. SQL Editor → paste & run `supabase/migrations/001_initial.sql`  
3. Project Settings → API → copy:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server only — never expose to browser
```

---

### 7. Deploy to Vercel

1. Push this folder to a **new** GitHub repo (e.g. `personal-assistant`)  
2. https://vercel.com → Import project  
3. Add **all** env vars from `.env.local` in Vercel → Settings → Environment Variables  
4. Deploy  

Your app URL will look like: `https://personal-assistant-xxx.vercel.app`

---

### 8. Point cron-job.org at Vercel (not GitHub Actions)

1. Pause the old GitHub Actions cron (already done)  
2. New job on cron-job.org:

| Field | Value |
|--------|--------|
| URL | `https://YOUR-APP.vercel.app/api/cron/poll` |
| Schedule | every **2 minutes** (or 1–2 min) |
| Request method | GET |
| Header | `Authorization: Bearer YOUR_CRON_SECRET` |

Optional: only 7:00–23:59 in America/Detroit — the app **also** gates with cron_control, so overnight hits are cheap no-ops even if cron runs 24/7.

3. In the web app → **Settings**:
   - Cron mode: **window**
   - Window: `07:00` – `24:00`
   - Timezone: `America/Detroit`

---

### 9. Smoke test

1. Admin → **Sync inbox now**  
2. Text your Google Voice number: `hey`  
3. Wait ~2 minutes (or Sync again)  
4. Try `.todo buy milk` then `.todo`  
5. Optional: set `GOOGLE_VOICE_REPLY_EMAIL` in Vercel once you see the relay address in logs/settings (format like `gvnumber.yourphone@txt.voice.google.com`)

---

## Env var checklist

| Variable | Required | Where |
|----------|----------|--------|
| `GROQ_API_KEY` | yes | Groq console |
| `PHONE_EMAIL` | yes | your carrier SMS email |
| `GOOGLE_CLIENT_ID` | yes | OAuth script / Cloud Console |
| `GOOGLE_CLIENT_SECRET` | yes | same |
| `GOOGLE_REFRESH_TOKEN` | yes | OAuth script |
| `CRON_SECRET` | yes | you choose |
| `GOOGLE_VOICE_REPLY_EMAIL` | recommended | from first inbound GV mail |
| `TIMEZONE` / `WEATHER_CITY` | optional | defaults Detroit |
| Supabase trio | recommended on Vercel | Supabase dashboard |

---

## Cost notes (Hobby)

- Empty cron ticks outside the window return immediately → tiny CPU  
- Real work only when you text / a reminder is due / briefing time  
- Keep display-style pages manual (Sync button) — no auto-polling Gmail from the browser  

---

## SMS shortcuts (same as old bot)

| Text | Action |
|------|--------|
| `.todo item` / `.todo` | add / show |
| `.groceries milk` | grocery list (aisle-sorted) |
| `done 2` / `-milk` | check off |
| `remind me to…` | SMS reminder |
| `quote` / `mlem` / `note: …` | shortcuts |
| `timezone America/Chicago` | change timezone only |
| `I'm in Seattle now` | set weather city + timezone |
| `due today` / `due tomorrow` / `due this week` | assignment due list |
| `who is Amelia Earhart` | general knowledge |

---

## Migrating off GitHub Actions

Keep the old `text-assistant` repo paused. Once Vercel + cron works for a day or two, you can archive the Actions workflow entirely.
