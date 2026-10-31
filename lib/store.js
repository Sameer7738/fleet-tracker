const DEFAULT_STORE = {
  fleet: [
    { hex: "A2FB16", name: "N291VK", tags: [] },
    { hex: "A000B8", name: "N1HG", tags: [] }
  ],
  state: {},
  events: {},
  last: {},
  settings: {
    taxiKt: 3,
    offlineMin: 5,
    gapMin: 10,
    webhookUrl: "",
    alertEvents: ["Took off", "Landed", "Started taxiing out", "Went offline"]
  },
  audit: []
};

// Provisioned free JSON bin — no user secrets required.
// Public read: https://j.jstash.app/<id>
// Write with edit token (trial bin, claim later at jstash.app if you want permanent).
const JSTASH_ID = process.env.JSTASH_BIN_ID || "QZqj1COfWfaBAp7QdUaQfQ";
const JSTASH_EDIT = process.env.JSTASH_EDIT_TOKEN || "js_edit_If1jbAR8mpyobPNwe9l5Yf0PTIBCwYMRzMh9ed64hnQ";
const PUBLIC_URL = `https://j.jstash.app/${JSTASH_ID}`;
const API_URL = `https://api.jstash.app/v1/bins/${JSTASH_ID}`;

function normalize(json) {
  return {
    fleet: json.fleet || [],
    state: json.state || {},
    events: json.events || {},
    last: json.last || {},
    settings: { ...DEFAULT_STORE.settings, ...(json.settings || {}) },
    audit: json.audit || [],
    _health: json._health || null,
    _backend: "jstash"
  };
}

export async function loadStore() {
  try {
    const r = await fetch(PUBLIC_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) throw new Error(`jstash read failed (${r.status})`);
    const json = await r.json();
    return normalize(json);
  } catch (e) {
    // Fall back to GitHub raw if jstash is down
    try {
      const repo = process.env.GITHUB_REPO || "Sameer7738/fleet-tracker";
      const r = await fetch(
        `https://raw.githubusercontent.com/${repo}/main/data/store.json`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const json = await r.json();
        return { ...normalize(json), _backend: "github-raw", _readonly: true };
      }
    } catch {}
    return { ...structuredClone(DEFAULT_STORE), _backend: "ephemeral", _readonly: true, _error: String(e.message || e) };
  }
}

export async function saveStore(store) {
  if (store._readonly) {
    throw new Error("Storage is read-only right now");
  }
  const body = {
    fleet: store.fleet,
    state: store.state,
    events: store.events,
    last: store.last,
    settings: store.settings,
    audit: (store.audit || []).slice(0, 300),
    _health: store._health || null
  };
  const r = await fetch(API_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JSTASH_EDIT}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`jstash write failed (${r.status}): ${t.slice(0, 200)}`);
  }
  store._backend = "jstash";
  return store;
}

export function pushEvent(store, hex, label, extra = {}) {
  const list = store.events[hex] || (store.events[hex] = []);
  const head = list[0];
  if (head && head.label === label && Date.now() - head.t < 90_000) return false;
  list.unshift({ t: Date.now(), label, ...extra });
  store.events[hex] = list.slice(0, 500);
  return true;
}

export function audit(store, action, detail = {}) {
  store.audit = store.audit || [];
  store.audit.unshift({ t: Date.now(), action, ...detail });
  store.audit = store.audit.slice(0, 300);
}
