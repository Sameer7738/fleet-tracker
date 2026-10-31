# Fleet Tracker

Professional ADS-B fleet tracker with **server-side 24/7 event logging** (taxi, takeoff, landing, offline), live map, board view, trail playback, CSV export, webhooks, and optional password lock.

**Live:** https://fleet-tracker-sameer7738s-projects.vercel.app

## Features

- Live map (Leaflet) with plane icons, trails, and dark mode
- Board view (table of fleet + status)
- Timeline events: came online, taxiing, takeoff, landing, offline — with lat/lon/alt and nearest airport
- **Background polling** via `/api/poll` so history is recorded even when the browser tab is closed
- Settings: taxi speed threshold, offline timeout, webhook URL
- CSV export of events
- Trail playback slider
- PWA-ready (`manifest` + service worker)
- ADS-B sources proxied through `/api/lookup` (adsb.lol, adsb.fi, OpenSky fallback) — no CORS issues

## Required setup for persistent 24/7 tracking

Without these two steps the site still shows the live map, but events only live in memory for the lifetime of the serverless function (they reset on cold starts).

### 1. GitHub PAT → `GITHUB_TOKEN`

1. Open https://github.com/settings/tokens?type=beta (fine-grained) or classic tokens.
2. Create a token with **Contents: Read and write** on the `Sameer7738/fleet-tracker` repository.
3. In Vercel → Project **fleet-tracker** → **Settings** → **Environment Variables**:
   - Name: `GITHUB_TOKEN`
   - Value: the PAT
   - Environments: Production, Preview, Development
4. Redeploy (Deployments → … → Redeploy) so the new env var is picked up.

Already configured on the project:

- `GITHUB_REPO` = `Sameer7738/fleet-tracker`
- `CRON_SECRET` = (protects `/api/poll`)

Optional:

- `FLEET_PASSWORD` — if set, the UI and fleet API require header `X-Fleet-Password` (saved in the browser via Settings).

### 2. External cron every 1–2 minutes

Vercel Hobby only allows **daily** crons, which is too slow for taxi/takeoff detection. Use a free external cron:

1. Sign up at https://cron-job.org (or EasyCron, UptimeRobot HTTP monitor, etc.).
2. Create a job that hits **every 1 or 2 minutes**:

   ```
   https://fleet-tracker-sameer7738s-projects.vercel.app/api/poll?secret=YOUR_CRON_SECRET
   ```

   Replace `YOUR_CRON_SECRET` with the value of the `CRON_SECRET` env var on Vercel.

3. Method: GET (or POST). No body required.

After a few poll cycles, open the site → **Health** and confirm **Last poll** is recent and **Storage** is `github`.

## API overview

| Route | Purpose |
|-------|---------|
| `GET /api/lookup?kind=hex\|callsign\|reg&value=…` | Proxy ADS-B position |
| `GET /api/fleet` | Fleet list + events + state |
| `POST /api/fleet` | Add aircraft, update settings |
| `GET /api/poll?secret=…` | Background track + event detection |
| `GET /api/health` | Storage mode, last poll, fleet size |
| `GET /api/export` | CSV of events (`?hex=` optional) |

## Local development

```bash
npx vercel dev
```

## Event state machine (summary)

- Offline → online when a position appears
- Ground + speed ≥ taxiKt → taxiing
- Climb / airborne → takeoff
- Return to ground → landing
- No position for `offlineMin` minutes → offline

Events include coordinates, altitude, ground speed, and nearest major airport when available.

## Notes

- Events are deduped (same label within ~90s is ignored).
- Max 500 events retained per aircraft; audit log capped at 300.
- Webhook (if set) receives JSON on selected event labels.
