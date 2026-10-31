export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=3, stale-while-revalidate=8");
  if (req.method === "OPTIONS") return res.status(204).end();

  const kind = String(req.query.kind || "hex").toLowerCase();
  const value = String(req.query.value || "").trim().toLowerCase();
  if (!value) return res.status(400).json({ error: "Missing value", ac: null, answered: 0, total: 0 });

  const paths =
    kind === "hex" ? ["hex"] :
    kind === "callsign" ? ["callsign"] :
    kind === "reg" || kind === "registration" ? ["reg", "registration"] :
    ["hex", "callsign", "reg"];

  const bases = ["https://api.adsb.lol/v2", "https://opendata.adsb.fi/api/v2"];
  const jobs = [];
  for (const b of bases) {
    for (const p of paths) {
      const url = `${b}/${p}/${encodeURIComponent(value)}`;
      jobs.push(
        fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) })
          .then(async r => {
            if (!r.ok) return null;
            const d = await r.json();
            const list = d?.ac || d?.aircraft || [];
            return Array.isArray(list) ? list.map(a => ({ ...a, _src: b.includes("adsb.lol") ? "adsb.lol" : "adsb.fi" })) : null;
          })
          .catch(() => null)
      );
    }
  }
  if (kind === "hex" || /^[0-9a-f]{6}$/i.test(value)) {
    jobs.push(
      fetch(`https://opensky-network.org/api/states/all?icao24=${encodeURIComponent(value)}`, { signal: AbortSignal.timeout(8000) })
        .then(async r => {
          if (!r.ok) return null;
          const d = await r.json();
          const s = d?.states?.[0];
          if (!s) return [];
          return [{
            hex: value,
            lat: s[6],
            lon: s[5],
            alt_baro: s[8] ? "ground" : (s[7] != null ? s[7] * 3.28084 : null),
            gs: s[9] != null ? s[9] * 1.94384 : null,
            track: s[10],
            baro_rate: s[11] != null ? s[11] * 196.85 : null,
            squawk: s[14],
            flight: s[1],
            seen_pos: s[3] ? Date.now() / 1000 - s[3] : 0,
            _src: "opensky"
          }];
        })
        .catch(() => null)
    );
  }

  const results = await Promise.all(jobs);
  const answered = results.filter(r => r !== null).length;
  const all = results.flat().filter(a => a && a.lat != null && a.lon != null);
  all.sort((a, b) => (a.seen_pos ?? a.seen ?? 99) - (b.seen_pos ?? b.seen ?? 99));
  if (!answered) return res.status(502).json({ error: "Data sources unreachable", ac: null, answered: 0, total: jobs.length });
  return res.status(200).json({ ac: all[0] || null, answered, total: jobs.length });
}
