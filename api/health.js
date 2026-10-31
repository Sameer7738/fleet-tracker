import { loadStore } from "../lib/store.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const out = { ok: true, time: new Date().toISOString(), storage: "unknown", lastPoll: null };
  try {
    const store = await loadStore();
    out.storage = "ok";
    out.fleetCount = store.fleet?.length || 0;
    out.lastPoll = store._health || null;
    out.hasWebhook = !!(store.settings?.webhookUrl);
    out.authRequired = !!process.env.FLEET_PASSWORD;
  } catch (e) {
    out.ok = false;
    out.storage = "error";
    out.error = e.message || String(e);
  }
  return res.status(out.ok ? 200 : 503).json(out);
}
