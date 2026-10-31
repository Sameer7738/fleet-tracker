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

function repoParts() {
  const raw = process.env.GITHUB_REPO || "Sameer7738/fleet-tracker";
  const [owner, repo] = raw.split("/");
  return { owner, repo };
}

async function gh(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured on this deployment");
  const { owner, repo } = repoParts();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  return fetch(url, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
}

export async function loadStore() {
  try {
    const r = await gh("data/store.json");
    if (r.status === 404) return { ...structuredClone(DEFAULT_STORE), _sha: null };
    if (!r.ok) throw new Error(`GitHub read failed (${r.status})`);
    const meta = await r.json();
    const json = JSON.parse(Buffer.from(meta.content, "base64").toString("utf8"));
    return {
      fleet: json.fleet || [],
      state: json.state || {},
      events: json.events || {},
      last: json.last || {},
      settings: { ...DEFAULT_STORE.settings, ...(json.settings || {}) },
      audit: json.audit || [],
      _sha: meta.sha
    };
  } catch (e) {
    if (String(e.message || e).includes("GITHUB_TOKEN")) throw e;
    return { ...structuredClone(DEFAULT_STORE), _sha: null };
  }
}

export async function saveStore(store) {
  const body = {
    fleet: store.fleet,
    state: store.state,
    events: store.events,
    last: store.last,
    settings: store.settings,
    audit: (store.audit || []).slice(0, 300)
  };
  const content = Buffer.from(JSON.stringify(body, null, 2)).toString("base64");
  const payload = {
    message: `fleet-tracker: update ${new Date().toISOString()}`,
    content,
    branch: process.env.GITHUB_BRANCH || "main"
  };
  if (store._sha) payload.sha = store._sha;
  const r = await gh("data/store.json", { method: "PUT", body: JSON.stringify(payload) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub write failed (${r.status}): ${t.slice(0, 200)}`);
  }
  const meta = await r.json();
  store._sha = meta.content?.sha || store._sha;
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
