// Minimal major-airport set for nearest-airport labels
const AIRPORTS = [
  ["KJFK", "New York JFK", 40.6413, -73.7781], ["KLGA", "New York LGA", 40.7769, -73.8740],
  ["KEWR", "Newark", 40.6895, -74.1745], ["KTEB", "Teterboro", 40.8501, -74.0608],
  ["KLAX", "Los Angeles", 33.9416, -118.4085], ["KSFO", "San Francisco", 37.6213, -122.3790],
  ["KORD", "Chicago O'Hare", 41.9742, -87.9073], ["KMDW", "Chicago Midway", 41.7868, -87.7522],
  ["KATL", "Atlanta", 33.6407, -84.4277], ["KDFW", "Dallas/Fort Worth", 32.8998, -97.0403],
  ["KDEN", "Denver", 39.8561, -104.6737], ["KSEA", "Seattle", 47.4502, -122.3088],
  ["KMIA", "Miami", 25.7959, -80.2870], ["KBOS", "Boston", 42.3656, -71.0096],
  ["KIAD", "Washington Dulles", 38.9531, -77.4565], ["KDCA", "Washington National", 38.8512, -77.0402],
  ["KPHX", "Phoenix", 33.4373, -112.0078], ["KLAS", "Las Vegas", 36.0840, -115.1537],
  ["KMCO", "Orlando", 28.4312, -81.3081], ["KHOU", "Houston Hobby", 29.6454, -95.2789],
  ["KIAH", "Houston Intercontinental", 29.9902, -95.3368], ["KDTW", "Detroit", 42.2162, -83.3554],
  ["KMSP", "Minneapolis", 44.8848, -93.2223], ["KPHL", "Philadelphia", 39.8744, -75.2424],
  ["KCLT", "Charlotte", 35.2140, -80.9431], ["KBNA", "Nashville", 36.1263, -86.6774],
  ["KSAV", "Savannah", 32.1276, -81.2021], ["KJAX", "Jacksonville", 30.4941, -81.6879],
  ["KCHS", "Charleston", 32.8986, -80.0405], ["KSFB", "Sanford", 28.7776, -81.2375],
  ["EGLL", "London Heathrow", 51.4700, -0.4543], ["EGKK", "London Gatwick", 51.1537, -0.1821],
  ["LFPG", "Paris CDG", 49.0097, 2.5479], ["EDDF", "Frankfurt", 50.0379, 8.5622],
  ["EHAM", "Amsterdam", 52.3105, 4.7683], ["LTFM", "Istanbul", 41.2753, 28.7519],
  ["OMDB", "Dubai", 25.2532, 55.3657], ["VHHH", "Hong Kong", 22.3080, 113.9185],
  ["RJTT", "Tokyo Haneda", 35.5494, 139.7798], ["RJAA", "Tokyo Narita", 35.7720, 140.3929],
  ["YSSY", "Sydney", -33.9399, 151.1753], ["CYYZ", "Toronto", 43.6777, -79.6248],
  ["KAPF", "Naples FL", 26.1526, -81.7755], ["KPBI", "West Palm Beach", 26.6832, -80.0956],
  ["KFLL", "Fort Lauderdale", 26.0726, -80.1527], ["KTPA", "Tampa", 27.9755, -82.5332],
  ["KBCT", "Boca Raton", 26.3785, -80.1077], ["KFXE", "Fort Lauderdale Exec", 26.1973, -80.1707],
  ["KOPF", "Miami-Opa Locka", 25.9070, -80.2784], ["KHPN", "White Plains", 41.0670, -73.7076],
  ["KISP", "Islip", 40.7952, -73.1002], ["KFRG", "Farmingdale", 40.7288, -73.4134]
];

export function nearestAirport(lat, lon) {
  if (lat == null || lon == null) return null;
  let best = null, bestD = 1e9;
  for (const [icao, name, alat, alon] of AIRPORTS) {
    const dlat = lat - alat, dlon = lon - alon;
    const d = dlat * dlat + dlon * dlon;
    if (d < bestD) { bestD = d; best = { icao, name, nm: Math.sqrt(d) * 60 }; }
  }
  if (!best || best.nm > 40) return null;
  return best;
}

export async function fetchPosition(hex) {
  const h = hex.toLowerCase();
  const bases = [`https://api.adsb.lol/v2/hex/${h}`, `https://opendata.adsb.fi/api/v2/hex/${h}`];
  const jobs = bases.map(url =>
    fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) })
      .then(async r => {
        if (!r.ok) return null;
        const d = await r.json();
        const ac = (d.ac || d.aircraft || [])[0];
        return ac && ac.lat != null ? { ...ac, _src: url.includes("adsb.lol") ? "adsb.lol" : "adsb.fi" } : null;
      }).catch(() => null)
  );
  jobs.push(
    fetch(`https://opensky-network.org/api/states/all?icao24=${h}`, { signal: AbortSignal.timeout(8000) })
      .then(async r => {
        if (!r.ok) return null;
        const d = await r.json();
        const s = d?.states?.[0];
        if (!s || s[6] == null) return null;
        return {
          hex: h, lat: s[6], lon: s[5],
          alt_baro: s[8] ? "ground" : (s[7] != null ? s[7] * 3.28084 : null),
          gs: s[9] != null ? s[9] * 1.94384 : null, track: s[10],
          baro_rate: s[11] != null ? s[11] * 196.85 : null, squawk: s[14], flight: s[1],
          seen_pos: s[3] ? Date.now() / 1000 - s[3] : 0, _src: "opensky"
        };
      }).catch(() => null)
  );
  const results = await Promise.all(jobs);
  const hits = results.filter(Boolean);
  hits.sort((a, b) => (a.seen_pos ?? a.seen ?? 99) - (b.seen_pos ?? b.seen ?? 99));
  return hits[0] || null;
}

export async function fireWebhook(url, payload) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
  } catch {}
}

export function applyTrack(store, aircraft, p, pushEvent) {
  const hex = aircraft.hex;
  const now = Date.now();
  const st = store.state[hex] || (store.state[hex] = {});
  const s = store.settings || {};
  const taxiKt = Number(s.taxiKt) || 3;
  const offlineMs = (Number(s.offlineMin) || 5) * 60_000;
  const gapMs = (Number(s.gapMin) || 10) * 60_000;
  const alertSet = new Set(s.alertEvents || []);

  const posExtra = p && p.lat != null
    ? { lat: p.lat, lon: p.lon, alt: p.alt_baro, gs: p.gs, track: p.track }
    : {};
  if (p?.lat != null) {
    const ap = nearestAirport(p.lat, p.lon);
    if (ap) { posExtra.airport = ap.icao; posExtra.airportNm = Math.round(ap.nm * 10) / 10; posExtra.airportName = ap.name; }
  }

  const emitted = [];
  const emit = (label) => {
    const ok = pushEvent(store, hex, label, posExtra);
    if (ok) emitted.push(label);
  };

  if (p) {
    const ground = p.alt_baro === "ground";
    const moving = (p.gs || 0) > taxiKt;
    const mode = ground ? "ground" : "air";

    if (!st.mode || st.mode === "offline" || now - (st.seen || 0) > gapMs) {
      const where = ground
        ? "on the ground" + (posExtra.airport ? ` near ${posExtra.airport}` : "")
        : "in the air" + (typeof p.alt_baro === "number" ? ` at ${Math.round(p.alt_baro)} ft` : "");
      emit(`Came online ${where}`);
      st.landed = false; st.moving = false;
    } else {
      if (st.mode === "ground" && mode === "air") {
        emit("Took off" + (posExtra.airport ? ` near ${posExtra.airport}` : ""));
        st.landed = false;
      }
      if (st.mode === "air" && mode === "ground") {
        emit("Landed" + (posExtra.airport ? ` near ${posExtra.airport}` : ""));
        st.landed = true; st.moving = true;
      }
      if (mode === "ground" && moving && !st.moving) {
        emit((st.landed ? "Taxiing to parking" : "Started taxiing out") + (posExtra.airport ? ` at ${posExtra.airport}` : ""));
      }
      if (mode === "ground" && !moving && st.moving) {
        emit("Stopped moving" + (posExtra.airport ? ` at ${posExtra.airport}` : ""));
      }
    }
    if (mode === "ground") st.moving = moving;
    st.mode = mode; st.seen = now;
    store.last[hex] = {
      lat: p.lat, lon: p.lon, time: now, alt: p.alt_baro, gs: p.gs, track: p.track,
      src: p._src, flight: p.flight, r: p.r, t: p.t, airport: posExtra.airport
    };
  } else if (st.mode && st.mode !== "offline" && now - (st.seen || 0) > offlineMs) {
    emit("Went offline");
    st.mode = "offline";
  }

  return emitted.filter(l => alertSet.has(l) || [...alertSet].some(a => l.startsWith(a)));
}
