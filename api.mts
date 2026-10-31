import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const DEFAULT_FLEET = [{ hex: "A2FB16", name: "N291VK" }, { hex: "A000B8", name: "N1HG" }];
const headers = { "cache-control": "no-store" };

export default async (req: Request) => {
  const store = getStore("tracker");
  const path = new URL(req.url).pathname;
  if (path === "/api/events") {
    return Response.json(((await store.get("events", { type: "json" })) as any) ?? {}, { headers });
  }
  if (path === "/api/fleet") {
    if (req.method === "POST") {
      let body: any; try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
      if (!Array.isArray(body)) return new Response("Expected a list", { status: 400 });
      const clean = body.filter((a: any) => a && /^[0-9A-Fa-f]{6}$/.test(a.hex))
        .slice(0, 20).map((a: any) => ({ hex: String(a.hex).toUpperCase(), name: String(a.name || a.hex).slice(0, 20) }));
      await store.setJSON("fleet", clean);
      return Response.json(clean, { headers });
    }
    return Response.json(((await store.get("fleet", { type: "json" })) as any) ?? DEFAULT_FLEET, { headers });
  }
  return new Response("Not found", { status: 404 });
};

export const config: Config = { path: ["/api/fleet", "/api/events"] };
