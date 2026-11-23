"use client";

// Settings > Projects, like v1 (GET /api/roots-auth/tenant/{tenant}/projects): the tenant's projects
// with their member count. Each project has its own work item queue; none is tied to a tree.

import Link from "next/link";
import useSWR from "swr";
import { SettingsHeading, useTenant } from "@/components/settings/common";
import { ErrorBanner, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtDate } from "@/lib/workItems";
import { projectPaths } from "@/lib/paths";
import type { TenantProject } from "@/lib/types";


export default function ProjectsSettingsPage() {
  const { tenant } = useTenant();
  const projects = useSWR<TenantProject[]>(`ra:/tenant/${tenant}/projects`, fetcher);
  return (
    <>
      <SettingsHeading title="Projects" />
      <ErrorBanner error={projects.error} />
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[640px] text-[17px]">
          <thead>
            <tr className="h-16 border-b border-slate-200 text-left">
              <th className="px-8 font-semibold">Name</th>
              <th className="px-4 font-semibold">Queue ID</th>
              <th className="px-4 font-semibold">Members</th>
              <th className="px-4 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {projects.data?.map((p) => (
              <tr key={p.project_id} className="h-20 border-b border-slate-200">
                <td className="px-8">
                  <Link href={projectPaths(tenant, p.project_id).workitems} className="text-violet-700 hover:underline">
                    {p.display_name}
                  </Link>
                </td>
                <td className="px-4 font-mono text-[13px] text-slate-600">{p.queue_id ?? "—"}</td>
                <td className="px-4">{p.membersCount}</td>
                <td className="px-4 text-[15px] text-slate-600">{fmtDate(p.created_at)}</td>
              </tr>
            ))}
            {projects.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-8 py-12 text-center text-slate-500">
                  No projects.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!projects.data && !projects.error && <Spinner className="mx-auto mt-10 h-6 w-6 text-violet-500" />}
      </div>
    </>
  );
}
