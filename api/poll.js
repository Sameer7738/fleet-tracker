import { loadStore, saveStore, pushEvent } from "../lib/store.js";
import { fetchPosition, applyTrack, fireWebhook } from "../lib/track.js";

// Optional shared secret. Unauthenticated GET is allowed so the open website
// and simple free cron URLs can write history with zero setup.
function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.POLL_SECRET;
  if (!secret) return true;
  if (req.method === "GET") return true;
  const h = req.headers.authorization || "";
  const q = req.query?.secret;
  return h === `Bearer ${secret}` || q === secret;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });

  const started = Date.now();
  try {
    const store = await loadStore();
    if (store._readonly) {
      return res.status(503).json({ error: "Storage is read-only", backend: store._backend });
    }
    const results = [];
    for (const a of store.fleet) {
      const p = await fetchPosition(a.hex);
      const alerts = applyTrack(store, a, p, pushEvent);
      for (const label of alerts) {
        await fireWebhook(store.settings?.webhookUrl, {
          type: "fleet_event",
          hex: a.hex,
          name: a.name,
          label,
          at: new Date().toISOString(),
          last: store.last[a.hex] || null
        });
      }
      results.push({
        hex: a.hex,
        name: a.name,
        live: !!p,
        mode: store.state[a.hex]?.mode || null,
        last: store.last[a.hex] || null,
        alerts
      });
    }
    store._health = {
      lastPoll: Date.now(),
      ok: true,
      ms: Date.now() - started,
      live: results.filter(r => r.live).length
    };
    await saveStore(store);
    return res.status(200).json({
      ok: true,
      at: new Date().toISOString(),
      ms: Date.now() - started,
      backend: "jstash",
      count: store.fleet.length,
      live: results.filter(r => r.live).length,
      aircraft: results
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
