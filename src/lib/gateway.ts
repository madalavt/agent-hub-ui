// Server-side gateway from the browser to the backend services (same origin, like v1's /api/*).
// Service URLs and API keys are read from the server environment on every request, so the
// same image works in docker-compose and locally, and keys never reach the browser.
//
//   /api/roots-wim/...              work item manager (search)
//   /api/roots-queue/...            work item manager (one item)
//   /api/roots-iris/annotation/...  annotations (documents, details, page images)
//   /api/roots-igpt/node/...        decision tree nodes (fields, display template)
//   /api/proxy/{dt|ex|wi|an}/...    everything else

import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, decisionTreeUrl } from "@/lib/authConfig";

export type Service = "dt" | "ex" | "wi" | "an";

// The decision-tree API is called with the signed-in user's session token (from the cookie), never
// with the service key: the service key would bypass the role rules for every browser request.
const SERVICES: Record<Service, { url: () => string; key: () => string | undefined; label: string }> = {
  dt: { url: () => process.env.DECISION_TREE_API_URL ?? "http://localhost:8001", key: () => undefined, label: "Decision-tree" },
  ex: { url: () => process.env.EXTRACTION_API_URL ?? "http://localhost:8002", key: () => process.env.EXTRACTION_API_KEY, label: "Extraction" },
  wi: { url: () => process.env.WORK_ITEMS_API_URL ?? "http://localhost:8003", key: () => process.env.WORK_ITEMS_API_KEY, label: "Work Item Manager" },
  an: { url: () => process.env.ANNOTATIONS_API_URL ?? "http://localhost:8004", key: () => process.env.ANNOTATIONS_API_KEY, label: "Annotations" },
};

export function isService(s: string): s is Service {
  return s in SERVICES;
}

const FORWARD_REQUEST = ["content-type", "accept", "x-platform-user-id", "x-platform-tenant-id", "resource"];
const FORWARD_RESPONSE = [
  "content-type",
  "content-disposition",
  "content-length",
  "location",
  "x-total-count",
  "x-page-width",
  "x-page-height",
  "cache-control",
];

// Short-lived cache of verified session tokens so non-dt services (ex/wi/an) don't re-hit /v1/me
// on every page image or table request while still rejecting unauthenticated/expired callers.
const VERIFIED_TTL_MS = 15_000;
const verifiedSessions = new Map<string, number>();

async function requireValidSession(token: string | undefined): Promise<Response | null> {
  if (!token) return Response.json({ detail: "sign in required" }, { status: 401 });
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const cachedUntil = verifiedSessions.get(hash);
  if (cachedUntil && cachedUntil > now) return null;
  let res: Response;
  try {
    res = await fetch(`${decisionTreeUrl()}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    return Response.json({ detail: `Decision-tree service unreachable: ${err}` }, { status: 502 });
  }
  if (!res.ok) {
    verifiedSessions.delete(hash);
    if (res.status === 401 || res.status === 404) {
      return Response.json({ detail: "sign in required" }, { status: 401 });
    }
    return Response.json({ detail: `Authentication check failed (${res.status})` }, { status: 502 });
  }
  if (verifiedSessions.size > 500) verifiedSessions.clear();
  verifiedSessions.set(hash, now + VERIFIED_TTL_MS);
  return null;
}

export async function forward(req: NextRequest, service: Service, path: string[]): Promise<Response> {
  if (path.some((seg) => seg === "." || seg === ".." || seg.includes("/") || seg.includes("\\"))) {
    return Response.json({ detail: "invalid path" }, { status: 400 });
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (service !== "dt") {
    const authErr = await requireValidSession(token);
    if (authErr) return authErr;
  }
  const target = SERVICES[service];
  const url = `${target.url().replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const key = target.key();
  if (key) headers.set("X-API-Key", key);
  if (service === "dt" && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const hasBody = !["GET", "HEAD"].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error duplex is required by Node fetch for streamed request bodies
      duplex: hasBody ? "half" : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (err) {
    return Response.json({ detail: `${target.label} service unreachable: ${err}` }, { status: 502 });
  }
  const out = new Headers();
  for (const h of FORWARD_RESPONSE) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  const nullBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
  return new Response(nullBody ? null : upstream.body, { status: upstream.status, headers: out });
}

type Ctx = { params: Promise<{ path: string[] }> };

/** Route handlers for one gateway prefix; ``mapPath`` turns the browser path into the service's. */
export function gatewayRoute(service: Service, mapPath: (path: string[]) => string[] = (p) => p) {
  const handler = async (req: NextRequest, ctx: Ctx) => forward(req, service, mapPath((await ctx.params).path));
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}
