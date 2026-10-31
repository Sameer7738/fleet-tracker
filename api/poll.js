import { loadStore, saveStore, pushEvent } from "../lib/store.js";
import { fetchPosition, applyTrack } from "../lib/track.js";

function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.POLL_SECRET;
  if (!secret) return true;
  const h = req.headers.authorization || "";
  const q = req.query?.secret;
  return h === `Bearer ${secret}` || q === secret;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const store = await loadStore();
    const results = [];
    for (const a of store.fleet) {
      const p = await fetchPosition(a.hex);
      applyTrack(store, a, p, pushEvent);
      results.push({
        hex: a.hex,
        name: a.name,
        live: !!p,
        mode: store.state[a.hex]?.mode || null,
        last: store.last[a.hex] || null
      });
    }
    await saveStore(store);
    return res.status(200).json({
      ok: true,
      at: new Date().toISOString(),
      count: store.fleet.length,
      live: results.filter(r => r.live).length,
      aircraft: results
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
