// Browser side of sign-in: who is signed in, and what they may change. The server enforces the
// same rules (services/api/app/access.py); this only decides what the UI offers.
import useSWR from "swr";
import { setCurrentUser } from "./currentUser";

export type Role = "admin" | "editor" | "viewer";

export interface SessionUser {
  id: string;
  username: string | null;
  name: string;
  email: string | null;
  role: Role;
  provider: string;
  active: boolean;
  customer_ids: string[];
  /** Role and permissions per tenant (customer), like v1's tenant roles. */
  tenants?: { customer_id: string; tenant_role_id: string | null; role_name: string | null; permissions: string[] }[];
}

export const SESSION_KEY = "/api/auth/session";

export class SessionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchSession(url: string): Promise<SessionUser> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new SessionError(res.status, body.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function useSession() {
  return useSWR<SessionUser, SessionError>(SESSION_KEY, fetchSession, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

/** May this user change the customer's projects (and so its trees' assignments)? Their role
 *  in that tenant decides (the Update permission); without one, their global role. */
export function canWriteCustomer(me: SessionUser | undefined, customerId: string): boolean {
  if (!me) return false;
  if (me.role === "admin") return true;
  const tenant = me.tenants?.find((t) => t.customer_id === customerId);
  if (tenant?.tenant_role_id) return tenant.permissions.includes("Update");
  return me.role === "editor" && me.customer_ids.includes(customerId);
}

/** May this user manage the tenant's users and roles (Settings)? Same rule as changes. */
export const canManageTenant = canWriteCustomer;

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  setCurrentUser(null);
  window.location.assign("/login");
}
