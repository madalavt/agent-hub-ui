"use client";

// Settings > Roles and Permissions, like v1: one card per role with its user count; create,
// edit (name, permissions) and delete roles.

import { useState } from "react";
import useSWR from "swr";
import { IconCheck, IconPlus } from "@/components/icons";
import { SettingsHeading, type TenantPermission, type TenantRole, useTenant } from "@/components/settings/common";
import { ErrorBanner, Modal, Spinner } from "@/components/ui";
import { Popover, PurpleButton } from "@/components/workitems/bits";
import { fetcher, ra } from "@/lib/api";

export default function RolesPage() {
  const { tenant, roles, canManage } = useTenant();
  const perms = useSWR<{ data: TenantPermission[] }>(`ra:/tenant/${tenant}/permission`, fetcher);
  const [editing, setEditing] = useState<TenantRole | "new" | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function remove(r: TenantRole) {
    if (!confirm(`Delete the role ${r.role_name}?`)) return;
    setError(null);
    try {
      await ra.del(`/tenant/${tenant}/roles/${r.tenant_role_id}`);
      await roles.mutate();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <>
      <SettingsHeading
        title="Roles and Permissions"
        action={
          canManage && (
            <PurpleButton className="gap-3 px-5 py-3 text-[15px] uppercase tracking-wide" onClick={() => setEditing("new")}>
              <IconPlus className="h-5 w-5 rounded-full ring-2 ring-white" /> Create new role
            </PurpleButton>
          )
        }
      />
      <hr className="mb-10 border-slate-200" />
      <ErrorBanner error={roles.error || error} onDismiss={() => setError(null)} />
      {!roles.data && !roles.error && <Spinner className="h-6 w-6 text-violet-500" />}
      <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
        {roles.data?.map((r) => (
          <div key={r.tenant_role_id} className="flex min-h-[230px] flex-col rounded-md border border-slate-300 p-8 shadow-sm">
            <div className="flex items-start justify-between">
              <RoleIcon />
              {canManage && (
                <Popover
                  width="w-48"
                  trigger={(_, toggle) => (
                    <button onClick={toggle} aria-label={`Actions for ${r.role_name}`} className="rounded px-2 text-2xl leading-none text-violet-600 hover:bg-violet-50">
                      ⋮
                    </button>
                  )}
                >
                  {(close) => (
                    <div className="py-1 text-sm">
                      <button onClick={() => (close(), setEditing(r))} className="block w-full px-3 py-2 text-left hover:bg-slate-50">
                        Edit role
                      </button>
                      {!r.built_in && (
                        <button onClick={() => (close(), remove(r))} className="block w-full px-3 py-2 text-left text-red-700 hover:bg-red-50">
                          Delete role
                        </button>
                      )}
                    </div>
                  )}
                </Popover>
              )}
            </div>
            <h3 className="mt-10 break-words text-[22px] font-semibold uppercase tracking-wide text-slate-950">{r.role_name}</h3>
            <p className="mt-3 text-[17px] text-slate-600">
              {r.users_count} User{r.users_count === 1 ? "" : "s"}
            </p>
            <p className="mt-auto pt-4 text-sm text-slate-500">{r.permissions.length ? r.permissions.join(", ") : "No permissions"}</p>
          </div>
        ))}
        {roles.data && canManage && (
          <button
            onClick={() => setEditing("new")}
            className="flex min-h-[230px] items-center justify-center gap-3 rounded-md border-2 border-dashed border-violet-300 text-[19px] font-semibold text-slate-950 hover:bg-violet-50"
          >
            <IconPlus className="h-6 w-6 text-violet-600" /> Create Role
          </button>
        )}
      </div>
      <RoleModal
        role={editing}
        tenant={tenant}
        permissions={perms.data?.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          roles.mutate();
        }}
      />
    </>
  );
}

function RoleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9 text-violet-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M3 7h9M3 12h7M3 17h9M15 8l2 2 4-4M16 15l4 4M20 15l-4 4" />
    </svg>
  );
}

function RoleModal({
  role,
  tenant,
  permissions,
  onClose,
  onSaved,
}: {
  role: TenantRole | "new" | null;
  tenant: string;
  permissions: TenantPermission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = role && role !== "new" ? role : null;
  const [name, setName] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const current = chosen ?? (editing ? permissions.filter((p) => editing.permissions.includes(p.tenant_permission_name)).map((p) => p.tenant_permission_id) : []);
  const roleName = name ?? editing?.role_name ?? "";

  function close() {
    setName(null);
    setChosen(null);
    setError(null);
    onClose();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await ra.put(`/tenant/${tenant}/roles/${editing.tenant_role_id}`, {
          ...(editing.built_in || roleName === editing.role_name ? {} : { role_name: roleName }),
          permission_ids: current,
        });
      } else {
        await ra.post(`/tenant/${tenant}/roles`, { role_name: roleName, permission_ids: current });
      }
      setName(null);
      setChosen(null);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!role} onClose={close} title={editing ? `Edit ${editing.role_name}` : "Create role"}>
      <form onSubmit={save} className="space-y-4 px-5 py-4">
        <ErrorBanner error={error} />
        <label className="block text-sm text-slate-700">
          Role name
          <input
            value={roleName}
            disabled={!!editing?.built_in}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. TEAM_LEAD"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase focus:border-violet-500 focus:outline-none disabled:bg-slate-50"
            required
          />
        </label>
        <fieldset>
          <legend className="text-sm text-slate-700">Permissions</legend>
          <div className="mt-2 space-y-2">
            {permissions.map((p) => {
              const on = current.includes(p.tenant_permission_id);
              return (
                <label key={p.tenant_permission_id} className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setChosen(on ? current.filter((x) => x !== p.tenant_permission_id) : [...current, p.tenant_permission_id])}
                    className="mt-1"
                  />
                  <span>
                    <span className="flex items-center gap-1 text-sm font-medium text-slate-900">
                      {p.tenant_permission_name} {on && <IconCheck className="h-4 w-4 text-violet-600" />}
                    </span>
                    <span className="text-xs text-slate-500">{p.permission_description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <PurpleButton type="button" variant="ghost" onClick={close}>
            Cancel
          </PurpleButton>
          <PurpleButton type="submit" disabled={busy || !roleName.trim()}>
            {editing ? "Save" : "Create role"}
          </PurpleButton>
        </div>
      </form>
    </Modal>
  );
}
