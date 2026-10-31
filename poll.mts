import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Runs every minute on Netlify, even when nobody has the page open.
const SOURCES = ["https://api.adsb.lol/v2", "https://api.airplanes.live/v2", "https://opendata.adsb.fi/api/v2", "https://api.adsb.one/v2"];
const OFFLINE_MS = 5 * 60e3, GAP_MS = 10 * 60e3, TAXI_KT = 3;
const DEFAULT_FLEET = [{ hex: "A2FB16", name: "N291VK" }, { hex: "A000B8", name: "N1HG" }];

async function getJSON(url: string): Promise<any> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch { return null; }
}
function fromOpenSky(d: any, hex: string): any[] {
  const s = d?.states?.[0]; if (!s) return [];
  return [{ hex, lat: s[6], lon: s[5], alt_baro: s[8] ? "ground" : s[7] != null ? s[7] * 3.28084 : null,
    gs: s[9] != null ? s[9] * 1.94384 : null, seen_pos: s[3] ? Date.now() / 1000 - s[3] : 0 }];
}
async function freshest(hex: string) {
  const v = hex.toLowerCase();
  const res = await Promise.all([
    ...SOURCES.map(b => getJSON(`${b}/hex/${v}`).then(d => d && (d.ac || d.aircraft || []))),
    getJSON(`https://opensky-network.org/api/states/all?icao24=${v}`).then(d => d && fromOpenSky(d, v)),
  ]);
  const answered = res.some(r => r !== null);
  const all = res.flat().filter((a: any) => a && a.lat != null);
  all.sort((a: any, b: any) => (a.seen_pos ?? a.seen ?? 0) - (b.seen_pos ?? b.seen ?? 0));
  return { ac: (all[0] as any) || null, answered };
}

function track(events: any, state: any, hex: string, p: any) {
  const now = Date.now(), st = (state[hex] = state[hex] || {});
  const log = (label: string) => { (events[hex] = events[hex] || []).unshift({ t: now, label }); events[hex].length = Math.min(events[hex].length, 100); };
  if (p) {
    const ground = p.alt_baro === "ground", moving = (p.gs || 0) > TAXI_KT, mode = ground ? "ground" : "air";
    if (!st.mode || st.mode === "offline" || now - st.seen > GAP_MS) {
      log("Came online " + (ground ? "on the ground" : "in the air" + (typeof p.alt_baro === "number" ? " at " + Math.round(p.alt_baro) + " ft" : "")));
      st.landed = false; st.moving = false;
    } else {
      if (st.mode === "ground" && mode === "air") { log("Took off"); st.landed = false; }
      if (st.mode === "air" && mode === "ground") { log("Landed"); st.landed = true; st.moving = true; }
      if (mode === "ground" && moving && !st.moving) log(st.landed ? "Taxiing to parking" : "Started taxiing out");
      if (mode === "ground" && !moving && st.moving) log("Stopped moving");
    }
    if (mode === "ground") st.moving = moving;
    st.mode = mode; st.seen = now;
  } else if (st.mode && st.mode !== "offline" && now - st.seen > OFFLINE_MS) {
    log("Went offline"); st.mode = "offline";
  }
}

export default async () => {
  const store = getStore("tracker");
  const fleet: any[] = ((await store.get("fleet", { type: "json" })) as any) ?? DEFAULT_FLEET;
  const events: any = ((await store.get("events", { type: "json" })) as any) ?? {};
  const state: any = ((await store.get("state", { type: "json" })) as any) ?? {};
  await Promise.all(fleet.map(async a => {
    const r = await freshest(a.hex);
    if (r.answered) track(events, state, a.hex, r.ac);  // if every source failed, don't guess
  }));
  await store.setJSON("events", events);
  await store.setJSON("state", state);
};

export const config: Config = { schedule: "* * * * *" };
