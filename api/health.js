import { loadStore } from "../lib/store.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const out = {
    ok: true,
    time: new Date().toISOString(),
    storage: "unknown",
    lastPoll: null,
    persistent: false
  };
  try {
    const store = await loadStore();
    out.storage = store._backend || "ok";
    out.persistent = !store._readonly && store._backend === "jstash";
    out.fleetCount = store.fleet?.length || 0;
    out.lastPoll = store._health || null;
    out.hasWebhook = !!(store.settings?.webhookUrl);
    out.authRequired = !!process.env.FLEET_PASSWORD;
    if (store._readonly) {
      out.warning = store._error || "Read-only storage mode";
    } else if (out.persistent) {
      out.warning = null;
    }
  } catch (e) {
    out.ok = false;
    out.storage = "error";
    out.error = e.message || String(e);
  }
  return res.status(out.ok ? 200 : 503).json(out);
}
