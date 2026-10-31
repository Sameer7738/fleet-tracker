import { loadStore, storageMode } from "../lib/store.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const out = {
    ok: true,
    time: new Date().toISOString(),
    storage: storageMode(),
    lastPoll: null,
    persistent: storageMode() === "github"
  };
  try {
    const store = await loadStore();
    out.fleetCount = store.fleet?.length || 0;
    out.lastPoll = store._health || null;
    out.hasWebhook = !!(store.settings?.webhookUrl);
    out.authRequired = !!process.env.FLEET_PASSWORD;
    if (!out.persistent) {
      out.warning = "GITHUB_TOKEN not set — events are in-memory only and reset on cold start. Add a PAT for 24/7 history.";
    }
  } catch (e) {
    out.ok = false;
    out.storage = "error";
    out.error = e.message || String(e);
  }
  return res.status(out.ok ? 200 : 503).json(out);
}
