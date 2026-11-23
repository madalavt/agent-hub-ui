"use client";

// Global top navigation: brand · Home · Work Items · Documents · Decision Tree Library
// ··· Current Project ▾ (work item screens) · avatar (signed-in user, sign out).

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "@/components/icons";
import { cx } from "@/components/ui";
import { useQueueSelection } from "@/components/workitems/queueSelection";
import { initials } from "@/lib/currentUser";
import { type SessionUser, canManageTenant, signOut } from "@/lib/session";

type NavItem = { href: string | null; label: string; active: boolean };

export function TopBar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const { projects, project, setQueueId, projectId, paths, tenantId } = useQueueSelection();
  const inProject = !!projectId;
  // Like v1, every section is scoped to a project: the one in the URL, else the last used.
  const home = paths?.home ?? (tenantId ? `/orgs/${tenantId}/projects` : "/");
  const nav: NavItem[] = [
    { href: home, label: "Home", active: /^\/orgs\/[^/]+\/projects\/?$/.test(pathname) || pathname === "/" },
    { href: paths?.workitems ?? null, label: "Work Items", active: pathname.includes("/workitems") },
    { href: paths?.documents ?? null, label: "Documents", active: /\/projects\/[^/]+\/documents/.test(pathname) },
    { href: paths?.library ?? null, label: "Decision Tree Library", active: pathname.includes("/premium-steps/") },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex h-[72px] min-w-0 items-stretch gap-3 px-3 sm:gap-8 sm:px-5">
        <Link href={home} className="flex shrink-0 items-center gap-2" aria-label="Agent Hub home">
          <span className="flex h-6 items-end gap-[3px]" aria-hidden>
            {[14, 20, 24, 18].map((h, i) => (
              <span key={i} className="w-[4px] rounded-sm bg-violet-600" style={{ height: h, opacity: 0.55 + i * 0.15 }} />
            ))}
          </span>
          <span className="hidden text-[22px] font-medium tracking-tight text-slate-800 sm:inline">Agent Hub</span>
        </Link>
        <nav className="flex min-w-0 items-stretch gap-4 overflow-x-auto whitespace-nowrap sm:gap-7">
          {nav.map((n) =>
            n.href ? (
              <Link
                key={n.label}
                href={n.href}
                className={cx(
                  "flex items-center border-b-[3px] pt-[3px] text-[15px] font-semibold transition-colors",
                  n.active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-700 hover:text-slate-950",
                )}
              >
                {n.label}
              </Link>
            ) : (
              <span key={n.label} className="flex items-center border-b-[3px] border-transparent pt-[3px] text-[15px] font-semibold text-slate-400" title="No project available">
                {n.label}
              </span>
            ),
          )}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
          {inProject && (
            <>
              <label htmlFor="current-project" className="hidden text-[15px] text-slate-700 lg:block">
                Current Project:
              </label>
              <div className="relative">
                <select
                  id="current-project"
                  value={project?.project_id ?? ""}
                  onChange={(e) => {
                    const p = projects?.find((x) => x.project_id === e.target.value);
                    if (p?.queueId) setQueueId(p.queueId);
                    else if (p) window.location.assign(`/orgs/${p.tenant_id}/projects/${p.project_id}/workitems`);
                  }}
                  className="h-10 w-36 appearance-none truncate sm:h-12 sm:w-[300px] rounded border border-slate-300 bg-white pl-4 pr-10 text-[15px] text-slate-900 hover:border-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  {!projects?.length && <option value="">{projects ? "No projects available" : "Loading…"}</option>}
                  {projects?.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
                <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </>
          )}
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  // Settings of the tenant in the URL (v1: avatar menu → Settings), for those who may manage it.
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const tenant = tenantSlug && canManageTenant(user, tenantSlug) ? tenantSlug : null;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Signed in as ${user.name}`}
        aria-label="Account"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 font-slab text-lg font-semibold text-white ring-offset-2 hover:ring-2 hover:ring-violet-300"
      >
        {initials(user.name)}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-60 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
            <div className="text-xs capitalize text-slate-500">{user.role}</div>
          </div>
          {tenant && (
            <Link
              href={`/orgs/${tenant}/settings/users`}
              onClick={() => setOpen(false)}
              className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Settings
            </Link>
          )}
          <button
            onClick={() => signOut()}
            className="w-full border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
