// Shared by the server (route handlers, middleware) and the browser. No React imports here.
//
// Sign-in is provider-based in the decision-tree API. The UI only ever holds an httpOnly cookie
// with the API's session token; the proxy turns it into an Authorization header. A new provider
// (Entra ID, OAuth) adds a callback route under /api/auth that sets the same cookie.

export const SESSION_COOKIE = "ah_session";

export function decisionTreeUrl(): string {
  return (process.env.DECISION_TREE_API_URL ?? "http://localhost:8001").replace(/\/$/, "");
}

export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true";
}
