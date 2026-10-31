import { loadStore } from "../lib/store.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const store = await loadStore();
    const hex = String(req.query.hex || "").toUpperCase();
    const rows = [["hex", "name", "time_iso", "label", "lat", "lon", "alt", "gs", "airport"]];
    const list = hex ? store.fleet.filter(a => a.hex === hex) : store.fleet;
    for (const a of list) {
      for (const e of (store.events[a.hex] || [])) {
        rows.push([
          a.hex, a.name,
          new Date(e.t).toISOString(),
          e.label,
          e.lat ?? "", e.lon ?? "", e.alt ?? "", e.gs ?? "", e.airport ?? ""
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => {
      const s = String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="fleet-events${hex ? "-" + hex : ""}.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
