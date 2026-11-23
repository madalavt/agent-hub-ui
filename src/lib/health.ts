// Server-side: aggregate health of the whole application (UI + decision-tree API + extraction +
// work item manager + annotations).

export type HealthStatus = "ok" | "degraded" | "down";

export interface ServiceHealth {
  service: string;
  status: HealthStatus;
  version?: string;
  uptime_s?: number;
  checked_at?: string;
  url?: string;
  latency_ms?: number;
  error?: string;
  checks?: Record<
    string,
    { status: HealthStatus; critical: boolean; latency_ms: number | null; details: Record<string, unknown>; error: string | null }
  >;
}

export interface AppHealth {
  application: "agent-hub";
  status: HealthStatus;
  checked_at: string;
  services: Record<"ui" | "api" | "extraction" | "work_items" | "annotations", ServiceHealth>;
}

const STARTED = Date.now();

export function uiLiveness(): ServiceHealth {
  return {
    service: "agent-hub-ui",
    status: "ok",
    version: process.env.npm_package_version ?? "0.1.0",
    uptime_s: Math.round((Date.now() - STARTED) / 100) / 10,
  };
}

async function probe(name: string, baseUrl: string, apiKey: string | undefined, path: string): Promise<ServiceHealth> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: apiKey ? { "X-API-Key": apiKey } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(Number(process.env.HEALTH_TIMEOUT_MS ?? 8000)),
    });
    const body = (await res.json().catch(() => ({}))) as ServiceHealth;
    return {
      ...body,
      service: body.service ?? name,
      status: body.status ?? (res.ok ? "ok" : "down"),
      url: baseUrl,
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    return { service: name, status: "down", url: baseUrl, latency_ms: Date.now() - started, error: `unreachable: ${err}` };
  }
}

export async function appHealth(deep = false): Promise<AppHealth> {
  const dtUrl = process.env.DECISION_TREE_API_URL ?? "http://localhost:8001";
  const exUrl = process.env.EXTRACTION_API_URL ?? "http://localhost:8002";
  const wiUrl = process.env.WORK_ITEMS_API_URL ?? "http://localhost:8003";
  const anUrl = process.env.ANNOTATIONS_API_URL ?? "http://localhost:8004";
  const [api, extraction, work_items, annotations] = await Promise.all([
    probe("agent-hub-api", dtUrl, process.env.DECISION_TREE_API_KEY, "/health"),
    probe("agent-hub-extraction", exUrl, process.env.EXTRACTION_API_KEY, `/health${deep ? "?deep=true" : ""}`),
    probe("agent-hub-work-items", wiUrl, process.env.WORK_ITEMS_API_KEY, "/health"),
    probe("agent-hub-annotations", anUrl, process.env.ANNOTATIONS_API_KEY, "/health"),
  ]);
  const services = { ui: uiLiveness(), api, extraction, work_items, annotations };
  const statuses = Object.values(services).map((s) => s.status);
  const status: HealthStatus = statuses.includes("down") ? "down" : statuses.includes("degraded") ? "degraded" : "ok";
  return { application: "agent-hub", status, checked_at: new Date().toISOString(), services };
}
