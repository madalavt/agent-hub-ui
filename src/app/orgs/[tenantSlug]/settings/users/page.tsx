"use client";

// Settings > Users, like v1: the tenant's users with their role; invite, change role, remove.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { IconSearch } from "@/components/icons";
import { SettingsHeading, type TenantMember, useTenant } from "@/components/settings/common";
import { ErrorBanner, Modal, Spinner } from "@/components/ui";
import { CopyButton, Popover, PurpleButton } from "@/components/workitems/bits";
import { fetcher, ra } from "@/lib/api";

export default function UsersPage() {
  const { tenant, roles, canManage, me } = useTenant();
  const members = useSWR<TenantMember[]>(`ra:/tenant/${tenant}/users/roles`, fetcher);
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invited, setInvited] = useState<TenantMember | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members.data ?? []).filter(
      (m) => !q || [m.display_name, m.email, m.role_name].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [members.data, query]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await Promise.all([members.mutate(), roles.mutate()]);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <>
      <SettingsHeading
        title="Users"
        action={
          canManage && (
            <PurpleButton className="px-5 py-3 text-[15px] uppercase tracking-wide" onClick={() => setInviting(true)}>
              Invite user +
            </PurpleButton>
          )
        }
      />
      <ErrorBanner error={members.error || error} onDismiss={() => setError(null)} />
      <label className="flex h-16 items-center gap-4 rounded-md border border-slate-300 px-6 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100">
        <IconSearch className="h-7 w-7 shrink-0 text-violet-700" strokeWidth={2.4} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-full w-full bg-transparent text-[20px] placeholder:text-slate-400 focus:outline-none" />
      </label>
      <div className="mt-8 overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[720px] text-[17px]">
          <thead>
            <tr className="h-16 border-b border-slate-200 text-left">
              <th className="px-8 font-semibold">Name</th>
              <th className="px-4 font-semibold">Role</th>
              <th className="px-4 font-semibold">Email address</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.tenant_user_id} className="h-20 border-b border-slate-200">
                <td className="px-8">{m.display_name}</td>
                <td className="px-4">{m.is_platform_admin ? "ADMIN (platform)" : (m.role_name ?? "—")}</td>
                <td className="px-4">{m.email ?? m.username ?? "—"}</td>
                <td className="px-4 text-right">
                  {canManage && !m.is_platform_admin && m.platform_user_id !== me?.id && (
                    <Popover
                      width="w-60"
                      trigger={(_, toggle) => (
                        <button onClick={toggle} aria-label={`Actions for ${m.display_name}`} className="rounded px-2 py-1 text-xl leading-none text-slate-600 hover:bg-slate-100">
                          ⋮
                        </button>
                      )}
                    >
                      {(close) => (
                        <div className="py-1 text-sm">
                          <div className="px-3 py-1 text-xs font-semibold uppercase text-slate-500">Change role</div>
                          {(roles.data ?? []).map((r) => (
                            <button
                              key={r.tenant_role_id}
                              disabled={r.tenant_role_id === m.tenant_role_id}
                              onClick={() => {
                                close();
                                act(() => ra.put(`/tenant/${tenant}/users/${m.platform_user_id}`, { tenant_role_id: r.tenant_role_id }));
                              }}
                              className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:text-violet-700"
                            >
                              {r.role_name}
                              {r.tenant_role_id === m.tenant_role_id ? " ✓" : ""}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              close();
                              if (confirm(`Remove ${m.display_name} from this tenant?`))
                                act(() => ra.del(`/tenant/${tenant}/users/${m.platform_user_id}`));
                            }}
                            className="block w-full border-t border-slate-100 px-3 py-2 text-left text-red-700 hover:bg-red-50"
                          >
                            Remove from tenant
                          </button>
                        </div>
                      )}
                    </Popover>
                  )}
                </td>
              </tr>
            ))}
            {members.data && shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-8 py-12 text-center text-slate-500">
                  No users.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!members.data && !members.error && <Spinner className="mx-auto mt-10 h-6 w-6 text-violet-500" />}
      </div>
      <InviteModal
        open={inviting}
        tenant={tenant}
        roles={(roles.data ?? []).map((r) => ({ id: r.tenant_role_id, name: r.role_name }))}
        onClose={() => setInviting(false)}
        onInvited={(m) => {
          setInviting(false);
          setInvited(m);
          act(async () => undefined);
        }}
      />
      <Modal
        open={!!invited}
        onClose={() => setInvited(null)}
        dismissible={!invited?.temporary_password}
        title="User invited"
        footer={<PurpleButton onClick={() => setInvited(null)}>Done</PurpleButton>}
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <b>{invited?.display_name}</b> can now sign in as <b>{invited?.username ?? invited?.email}</b> with the role{" "}
            <b>{invited?.role_name}</b>.
          </p>
          {invited?.temporary_password ? (
            <div className="rounded-md bg-amber-50 p-3 ring-1 ring-amber-200">
              <div className="text-xs font-medium text-amber-900">Temporary password (shown once — copy it before closing):</div>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 select-all rounded bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 ring-1 ring-amber-200">
                  {invited.temporary_password}
                </code>
                <CopyButton value={invited.temporary_password} label="Copy temporary password" />
              </div>
            </div>
          ) : (
            <p>They already had an account, so their password is unchanged.</p>
          )}
        </div>
      </Modal>
    </>
  );
}

function InviteModal({
  open,
  tenant,
  roles,
  onClose,
  onInvited,
}: {
  open: boolean;
  tenant: string;
  roles: { id: string; name: string }[];
  onClose: () => void;
  onInvited: (m: TenantMember) => void;
}) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", tenant_role_id: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const role = form.tenant_role_id || roles.find((r) => r.name === "ANNOTATOR")?.id || roles[0]?.id || "";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const m = await ra.post<TenantMember>(`/tenant/${tenant}/users`, { ...form, tenant_role_id: role });
      setForm({ first_name: "", last_name: "", email: "", tenant_role_id: "" });
      onInvited(m);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none";
  return (
    <Modal open={open} onClose={onClose} title="Invite user">
      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        <ErrorBanner error={error} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-slate-700">
            First name
            <input value={form.first_name} onChange={set("first_name")} className={input} required />
          </label>
          <label className="block text-sm text-slate-700">
            Last name
            <input value={form.last_name} onChange={set("last_name")} className={input} />
          </label>
        </div>
        <label className="block text-sm text-slate-700">
          Email address
          <input type="email" value={form.email} onChange={set("email")} className={input} required />
        </label>
        <label className="block text-sm text-slate-700">
          Role
          <select value={role} onChange={set("tenant_role_id")} className={input}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">
          New users get a temporary password to sign in with; people who already have an account join with their role.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <PurpleButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </PurpleButton>
          <PurpleButton type="submit" disabled={busy || !form.email || !form.first_name}>
            Invite
          </PurpleButton>
        </div>
      </form>
    </Modal>
  );
}
