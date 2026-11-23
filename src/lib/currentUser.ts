// The person using the UI. There is no sign-in in Agent Hub, so the user picks who they are
// (avatar menu in the work items header). The choice is sent to the backends as
// X-Platform-User-Id (annotation edits, assignments) and Resource (work item audit trail).

export interface CurrentUser {
  id: string;
  name: string;
  email?: string | null;
}

const KEY = "agenthub.currentUser";
const EVENT = "agenthub:current-user";

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: CurrentUser | null) {
  try {
    if (user) window.localStorage.setItem(KEY, JSON.stringify(user));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onCurrentUserChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function currentUserHeaders(): Record<string, string> {
  const u = getCurrentUser();
  if (!u) return {};
  // Header values must be ISO-8859-1; names outside it fall back to the id.
  const safe = /^[\x20-\x7e]*$/.test(u.name) ? u.name : u.id;
  return { "X-Platform-User-Id": u.id, Resource: `ui:${safe}` };
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/[\s._@-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
