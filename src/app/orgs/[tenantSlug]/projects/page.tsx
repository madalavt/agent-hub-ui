"use client";

// Tenant home (/orgs/{tenant}/projects, like v1): "You are viewing" picks the customer, then its
// projects (v1: GET /api/roots-auth/tenant/{tenant}/projects). A project has its own work item
// queue and no decision tree: automations pick a tree configuration (Decision Tree Library) in
// code. Customers (tenants) are created in the database; only the user's customers are listed.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { WorkProjectModal } from "@/components/WorkProjectModal";
import { IconChevronDown, IconEdit, IconPlus } from "@/components/icons";
import { ErrorBanner, Spinner } from "@/components/ui";
import { PurpleButton } from "@/components/workitems/bits";
import { fetcher } from "@/lib/api";
import { initials } from "@/lib/currentUser";
import { projectPaths, tenantHome } from "@/lib/paths";
import { canWriteCustomer, useSession } from "@/lib/session";
import type { Customer, TenantProject } from "@/lib/types";

export default function TenantHome() {
  const router = useRouter();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const me = useSession().data;
  const customers = useSWR<Customer[]>("dt:/v1/customers", fetcher);
  const list = customers.data ?? [];
  const customer = list.find((c) => c.id === tenantSlug);
  const projects = useSWR<TenantProject[]>(customer ? `ra:/tenant/${customer.id}/projects` : null, fetcher);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TenantProject | null>(null);
  const canWrite = !!customer && canWriteCustomer(me, customer.id);

  return (
    <main className="px-10 pb-16 pt-12">
      <ErrorBanner error={customers.error || projects.error} />
      {customers.isLoading && <Spinner className="h-6 w-6 text-violet-500" />}
      {customers.data && !customer && (
        <p className="text-[17px] text-slate-600">
          {list.length ? "You don't have access to this customer." : "You don't have access to any customer yet. Ask an administrator to assign one."}
        </p>
      )}
      {customer && (
        <>
          <fieldset className="relative w-[480px] max-w-full rounded border border-slate-300 bg-slate-100 px-4 pb-3 pt-1">
            <legend className="px-1 text-sm text-slate-800">You are viewing</legend>
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-violet-600 text-[11px] font-bold text-white">
                {initials(customer.name)}
              </span>
              <select
                aria-label="Customer"
                value={customer.id}
                onChange={(e) => router.push(tenantHome(e.target.value))}
                className="w-full appearance-none bg-transparent py-1.5 pr-8 text-[17px] font-medium text-violet-700 focus:outline-none"
              >
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <IconChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 text-slate-700" />
            </div>
          </fieldset>
          <p className="mt-6 text-[15px] font-semibold text-slate-900">Tenant ID: {customer.id.toUpperCase()}</p>

          <div className="mb-12 mt-20 flex flex-wrap items-center justify-between gap-4">
            <h1 className="font-slab text-[44px] font-bold leading-none tracking-tight text-slate-950">Projects</h1>
            {canWrite && (
              <PurpleButton className="px-5 py-3 uppercase tracking-wide" onClick={() => setCreating(true)}>
                New project <IconPlus className="h-4 w-4" />
              </PurpleButton>
            )}
          </div>

          {projects.isLoading && <Spinner className="h-6 w-6 text-violet-500" />}
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {projects.data?.map((p) => (
              <div key={p.project_id} className="relative rounded border border-slate-300 bg-white transition hover:shadow-md">
                <Link href={projectPaths(customer.id, p.project_id).workitems} className="block min-h-[220px] p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 font-slab text-lg text-white">
                    {initials(customer.name)}
                  </span>
                  <h3 className="mt-6 pr-8 text-[19px] font-semibold text-slate-950">{p.display_name}</h3>
                  {p.description && <p className="mt-2 line-clamp-2 text-[15px] text-slate-600">{p.description}</p>}
                </Link>
                {canWrite && (
                  <button
                    onClick={() => setEditing(p)}
                    className="absolute right-4 top-5 rounded p-2 text-violet-600 hover:bg-violet-50"
                    title="Edit project"
                    aria-label={`Edit ${p.display_name}`}
                  >
                    <IconEdit className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {canWrite && (
              <button
                onClick={() => setCreating(true)}
                className="flex min-h-[220px] items-center justify-center rounded border-2 border-dashed border-violet-300 text-violet-600 hover:bg-violet-50"
                aria-label="New project"
              >
                <IconPlus className="h-8 w-8" />
              </button>
            )}
          </div>
          {projects.data && projects.data.length === 0 && !canWrite && (
            <p className="text-[17px] text-slate-600">This customer has no projects yet.</p>
          )}

          <WorkProjectModal
            open={creating || !!editing}
            project={editing ?? undefined}
            customer={customer}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSaved={(p, isNew) => {
              setCreating(false);
              setEditing(null);
              projects.mutate();
              if (isNew) router.push(projectPaths(customer.id, p.project_id).workitems);
            }}
          />
        </>
      )}
    </main>
  );
}
