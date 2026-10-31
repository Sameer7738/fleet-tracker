const TAXI_KT = 3;
const OFFLINE_MS = 5 * 60 * 1000;
const GAP_MS = 10 * 60 * 1000;

export async function fetchPosition(hex) {
  const h = hex.toLowerCase();
  const bases = [
    `https://api.adsb.lol/v2/hex/${h}`,
    `https://opendata.adsb.fi/api/v2/hex/${h}`
  ];
  const jobs = bases.map(url =>
    fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) })
      .then(async r => {
        if (!r.ok) return null;
        const d = await r.json();
        const ac = (d.ac || d.aircraft || [])[0];
        return ac && ac.lat != null ? { ...ac, _src: url.includes("adsb.lol") ? "adsb.lol" : "adsb.fi" } : null;
      })
      .catch(() => null)
  );
  jobs.push(
    fetch(`https://opensky-network.org/api/states/all?icao24=${h}`, { signal: AbortSignal.timeout(8000) })
      .then(async r => {
        if (!r.ok) return null;
        const d = await r.json();
        const s = d?.states?.[0];
        if (!s || s[6] == null) return null;
        return {
          hex: h,
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
        };
      })
      .catch(() => null)
  );
  const results = await Promise.all(jobs);
  const hits = results.filter(Boolean);
  hits.sort((a, b) => (a.seen_pos ?? a.seen ?? 99) - (b.seen_pos ?? b.seen ?? 99));
  return hits[0] || null;
}

export function applyTrack(store, aircraft, p, pushEvent) {
  const hex = aircraft.hex;
  const now = Date.now();
  const st = store.state[hex] || (store.state[hex] = {});
  const posExtra = p && p.lat != null
    ? { lat: p.lat, lon: p.lon, alt: p.alt_baro, gs: p.gs, track: p.track }
    : {};

  if (p) {
    const ground = p.alt_baro === "ground";
    const moving = (p.gs || 0) > TAXI_KT;
    const mode = ground ? "ground" : "air";

    if (!st.mode || st.mode === "offline" || now - (st.seen || 0) > GAP_MS) {
      const where = ground
        ? "on the ground"
        : "in the air" + (typeof p.alt_baro === "number" ? ` at ${Math.round(p.alt_baro)} ft` : "");
      pushEvent(store, hex, `Came online ${where}`, posExtra);
      st.landed = false;
      st.moving = false;
    } else {
      if (st.mode === "ground" && mode === "air") {
        pushEvent(store, hex, "Took off", posExtra);
        st.landed = false;
      }
      if (st.mode === "air" && mode === "ground") {
        pushEvent(store, hex, "Landed", posExtra);
        st.landed = true;
        st.moving = true;
      }
      if (mode === "ground" && moving && !st.moving) {
        pushEvent(store, hex, st.landed ? "Taxiing to parking" : "Started taxiing out", posExtra);
      }
      if (mode === "ground" && !moving && st.moving) {
        pushEvent(store, hex, "Stopped moving", posExtra);
      }
    }
    if (mode === "ground") st.moving = moving;
    st.mode = mode;
    st.seen = now;
    store.last[hex] = { lat: p.lat, lon: p.lon, time: now, alt: p.alt_baro, gs: p.gs, track: p.track, src: p._src };
  } else if (st.mode && st.mode !== "offline" && now - (st.seen || 0) > OFFLINE_MS) {
    pushEvent(store, hex, "Went offline");
    st.mode = "offline";
  }
}
