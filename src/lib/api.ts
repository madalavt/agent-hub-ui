// Browser-side API client. Every call goes to this origin's gateway (src/lib/gateway.ts), on the
// same paths as v1: /api/roots-wim (work items), /api/roots-queue (one work item),
// /api/roots-iris/annotation (annotations), /api/roots-igpt (decision-tree nodes); the
// decision-tree and extraction APIs go through /api/proxy/{dt|ex}.

import { mutate } from "swr";
import { currentUserHeaders } from "./currentUser";
import { SESSION_KEY } from "./session";

export class ApiError extends Error {
  status: number;
  details: string[];
  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Service = "dt" | "ex" | "wi" | "an" | "ig" | "ra";

function gatewayUrl(service: Service, path: string, method = "GET"): string {
  switch (service) {
    case "wi":
      // One work item (GET /items/{traceId}) is read through roots-queue, like v1.
      if (method === "GET" && /^\/items\/[^/?]+\/?(\?|$)/.test(path)) return `/api/roots-queue${path}`;
      // ...and so is its form (the details screen's rows).
      if (method === "GET" && /^\/items\/[^/?]+\/form(\?|$)/.test(path)) return `/api/roots-queue${path}`;
      // The documents of a project are searched through roots-queue too.
      if (path.startsWith("/docs/searches")) return `/api/roots-queue${path}`;
      return `/api/roots-wim${path}`;
    case "an":
      return `/api/roots-iris/annotation${path}`;
    case "ig":
      return `/api/roots-igpt${path}`;
    case "ra":
      // Tenant users, roles and permissions (v1 roots-auth): /tenant/{tenant}/...
      return `/api/roots-auth${path}`;
    default:
      return `/api/proxy/${service}${path}`;
  }
}

async function request<T>(service: Service, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(gatewayUrl(service, path, init?.method ?? "GET"), {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...currentUserHeaders(),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) {
    if (res.status === 401) {
      void mutate(SESSION_KEY);
    }
    const detail = (body as { detail?: unknown })?.detail;
    let message = `${res.status} ${res.statusText}`;
    let details: string[] = [];
    if (typeof detail === "string") message = detail;
    else if (detail && typeof detail === "object" && "errors" in detail) {
      details = (detail as { errors: string[] }).errors;
      message = "Validation failed";
    } else if (Array.isArray(detail)) {
      details = detail.map((d: { loc?: unknown[]; msg?: string }) =>
        `${(d.loc ?? []).join(".")}: ${d.msg}`,
      );
      message = "Invalid request";
    } else if (typeof body === "string" && body) message = body.slice(0, 300);
    throw new ApiError(res.status, message, details);
  }
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const dt = {
  get: <T>(path: string) => request<T>("dt", path),
  post: <T>(path: string, data?: unknown) => request<T>("dt", path, json("POST", data)),
  put: <T>(path: string, data?: unknown) => request<T>("dt", path, json("PUT", data)),
  patch: <T>(path: string, data?: unknown) => request<T>("dt", path, json("PATCH", data)),
  del: (path: string) => request<void>("dt", path, { method: "DELETE" }),
};

export const ex = {
  get: <T>(path: string) => request<T>("ex", path),
  post: <T>(path: string, data?: unknown) => request<T>("ex", path, json("POST", data)),
  del: (path: string) => request<void>("ex", path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) =>
    request<T>("ex", path, { method: "POST", body: form }),
};

export const wi = {
  get: <T>(path: string) => request<T>("wi", path),
  post: <T>(path: string, data?: unknown) => request<T>("wi", path, json("POST", data)),
  put: <T>(path: string, data?: unknown) => request<T>("wi", path, json("PUT", data)),
  del: <T = void>(path: string, data?: unknown) => request<T>("wi", path, json("DELETE", data)),
};

/** Tenant users, roles and permissions (v1 roots-auth). */
export const ra = {
  get: <T>(path: string) => request<T>("ra", path),
  post: <T>(path: string, data?: unknown) => request<T>("ra", path, json("POST", data)),
  put: <T>(path: string, data?: unknown) => request<T>("ra", path, json("PUT", data)),
  del: <T = void>(path: string, data?: unknown) => request<T>("ra", path, json("DELETE", data)),
};

/** Annotations API (human review of extracted packages, linked to work items). */
export const ann = {
  get: <T>(path: string) => request<T>("an", path),
  post: <T>(path: string, data?: unknown) => request<T>("an", path, json("POST", data)),
  put: <T>(path: string, data?: unknown) => request<T>("an", path, json("PUT", data)),
  upload: <T>(path: string, form: FormData) => request<T>("an", path, { method: "POST", body: form }),
};

/** Raw (non-JSON) POST to the work item manager, e.g. the CSV export of the v2 search. */
export async function wiPostText(path: string, data: unknown): Promise<string> {
  const res = await fetch(gatewayUrl("wi", path, "POST"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...currentUserHeaders() },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, (await res.text()).slice(0, 300) || res.statusText);
  return res.text();
}

export const pageImageUrl = (packageId: number, documentId: number, pageId: number, dpi = 110) =>
  `/api/roots-iris/annotation/${packageId}/docImages/${documentId}/${pageId}?dpi=${dpi}`;

export const fileUrl = (packageId: number) => `/api/proxy/ex/v1/packages/${packageId}/file`;

/** SWR fetcher: keys look like "dt:/v1/customers" or "ex:/v1/packages/1". */
export const fetcher = <T>(key: string): Promise<T> => {
  const [service, ...rest] = key.split(":");
  return request<T>(service as Service, rest.join(":"));
};
