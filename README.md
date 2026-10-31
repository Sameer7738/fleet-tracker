# Fleet tracker

Live aircraft board + map with **server-side event history** (taxi, takeoff, landing, offline).

**Live:** https://fleet-tracker-sameer7738s-projects.vercel.app

## What works out of the box (no setup)

- Map + Board, trails, dark mode, CSV export, settings, health, PWA
- ADS-B lookup proxy (no CORS issues)
- Persistent fleet + events stored on a free JSON backend (jstash)
- `/api/poll` records positions and timeline events even when the browser is closed
- Default aircraft: N291VK, N1HG

## Keep history filling in the background

Call this URL every 1–2 minutes (any free cron works):

```
https://fleet-tracker-sameer7738s-projects.vercel.app/api/poll
```

If you set `CRON_SECRET` on Vercel, append `?secret=YOUR_SECRET`.

Hobby Vercel only allows daily built-in cron, so use an external scheduler for 1–2 minute intervals.

A coarse hourly backup poll is also available via Grok Automations when configured.

## Optional env vars (Vercel)

| Name | Purpose |
|------|---------|
| `CRON_SECRET` | Optional shared secret for `/api/poll` |
| `FLEET_PASSWORD` | Optional password for mutating the fleet |
| `JSTASH_BIN_ID` / `JSTASH_EDIT_TOKEN` | Override storage bin (defaults are baked in) |

## API

- `GET /api/fleet` — fleet, events, last positions
- `POST /api/fleet` — add/remove aircraft or update settings
- `GET /api/lookup?kind=hex&value=…` — ADS-B proxy
- `GET /api/poll` — background track + event writer
- `GET /api/health` — storage + last poll status
- `GET /api/export` — CSV of timeline events
