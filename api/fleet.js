import { loadStore, saveStore, audit } from "../lib/store.js";
import { fetchPosition } from "../lib/track.js";

function checkAuth(req) {
  const pw = process.env.FLEET_PASSWORD;
  if (!pw) return true;
  const h = req.headers["x-fleet-password"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return h === pw;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Fleet-Password, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const store = await loadStore();

    if (req.method === "GET") {
      return res.status(200).json({
        fleet: store.fleet, state: store.state, last: store.last, events: store.events,
        settings: {
          taxiKt: store.settings?.taxiKt, offlineMin: store.settings?.offlineMin, gapMin: store.settings?.gapMin,
          alertEvents: store.settings?.alertEvents, hasWebhook: !!(store.settings?.webhookUrl),
          authRequired: !!process.env.FLEET_PASSWORD
        },
        health: store._health || null, audit: (store.audit || []).slice(0, 50)
      });
    }

    if (!checkAuth(req)) return res.status(401).json({ error: "Password required" });

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (body.action === "settings") {
        store.settings = {
          ...store.settings,
          taxiKt: body.taxiKt ?? store.settings.taxiKt,
          offlineMin: body.offlineMin ?? store.settings.offlineMin,
          gapMin: body.gapMin ?? store.settings.gapMin,
          webhookUrl: body.webhookUrl !== undefined ? body.webhookUrl : store.settings.webhookUrl,
          alertEvents: body.alertEvents || store.settings.alertEvents
        };
        audit(store, "settings_updated", {});
        await saveStore(store);
        return res.status(200).json({ ok: true, settings: store.settings });
      }

      let hex = String(body.hex || "").replace(/^0x/i, "").trim().toUpperCase();
      let name = String(body.name || hex).trim();
      const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
      if (!/^[0-9A-F]{6}$/.test(hex)) {
        const value = String(body.query || body.callsign || body.reg || "").trim();
        if (!value) return res.status(400).json({ error: "Need hex or query" });
        const kinds = body.kind === "reg" ? ["reg"] : body.kind === "callsign" ? ["callsign"] : ["callsign", "reg"];
        let ac = null;
        for (const k of kinds) {
          for (const base of ["https://api.adsb.lol/v2", "https://opendata.adsb.fi/api/v2"]) {
            const paths = k === "reg" ? ["reg", "registration"] : [k];
            for (const p of paths) {
              try {
                const r = await fetch(`${base}/${p}/${encodeURIComponent(value.toLowerCase())}`, { signal: AbortSignal.timeout(6000) });
                if (!r.ok) continue;
                const d = await r.json();
                const list = d.ac || d.aircraft || [];
                if (list[0]?.hex) { ac = list[0]; break; }
              } catch {}
            }
            if (ac) break;
          }
          if (ac) break;
        }
        if (!ac) return res.status(404).json({ error: "Not transmitting — enter the ICAO hex instead" });
        hex = String(ac.hex).toUpperCase();
        name = ac.r || value.toUpperCase();
      }
      if (store.fleet.some(a => a.hex === hex)) return res.status(409).json({ error: `${name} is already in the fleet` });
      store.fleet.push({ hex, name, tags });
      const p = await fetchPosition(hex);
      if (p) store.last[hex] = { lat: p.lat, lon: p.lon, time: Date.now(), alt: p.alt_baro, gs: p.gs, track: p.track, src: p._src };
      audit(store, "aircraft_added", { hex, name });
      await saveStore(store);
      return res.status(200).json({ ok: true, aircraft: { hex, name, tags }, live: !!p });
    }

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const hex = String(body.hex || "").toUpperCase();
      const a = store.fleet.find(x => x.hex === hex);
      if (!a) return res.status(404).json({ error: "Not found" });
      if (body.name) a.name = String(body.name);
      if (Array.isArray(body.tags)) a.tags = body.tags.map(String);
      audit(store, "aircraft_updated", { hex });
      await saveStore(store);
      return res.status(200).json({ ok: true, aircraft: a });
    }

    if (req.method === "DELETE") {
      const hex = String(req.query.hex || "").toUpperCase();
      store.fleet = store.fleet.filter(a => a.hex !== hex);
      delete store.state[hex];
      audit(store, "aircraft_removed", { hex });
      await saveStore(store);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
