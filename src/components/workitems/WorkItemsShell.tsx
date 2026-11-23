"use client";

// Shared state for the work item screens: the current project (queue) and the people items can
// be assigned to. The top navigation itself is global (components/TopBar.tsx).

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo } from "react";
import useSWR from "swr";
import { ErrorBanner, cx } from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";
import type { CurrentUser } from "@/lib/currentUser";
import { useSession } from "@/lib/session";
import type { WiUser } from "@/lib/workItems";
import { type QueueSelection, rememberProject, useQueueSelection } from "./queueSelection";

interface Ctx extends QueueSelection {
  users: WiUser[];
  userName: (id: string | null | undefined) => string | null;
  mutateUsers: () => void;
  me: CurrentUser | null;
}

const WorkItemsContext = createContext<Ctx | null>(null);

export function useWorkItems(): Ctx {
  const ctx = useContext(WorkItemsContext);
  if (!ctx) throw new Error("useWorkItems must be used inside WorkItemsShell");
  return ctx;
}

export function WorkItemsShell({ children }: { children: React.ReactNode }) {
  const selection = useQueueSelection();
  // Remember the project being worked on (the top bar's links default to it elsewhere).
  useEffect(() => {
    if (selection.projectId && selection.tenantId) rememberProject(selection.tenantId, selection.projectId);
  }, [selection.projectId, selection.tenantId]);
  const users = useSWR<WiUser[]>("wi:/users", fetcher);
  const session = useSession().data;

  const nameById = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const ctx: Ctx = {
    ...selection,
    users: users.data ?? [],
    userName: (id) => (id ? (nameById.get(id) ?? id) : null),
    mutateUsers: () => users.mutate(),
    me: session ? { id: session.id, name: session.name, email: session.email } : null,
  };

  // A project the user may not see (or one that is not under the tenant in the URL): every page
  // under /orgs/{tenant}/projects/{project}/ says so, instead of showing empty data or raw errors.
  const { projectId, projects, projectsError, queuesError } = selection;
  const projectAuthDenied =
    projectsError instanceof ApiError && (projectsError.status === 403 || projectsError.status === 404);
  const denied =
    !!projectId && ((!!projects && !projects.some((p) => p.project_id === projectId)) || (!projects && projectAuthDenied));
  if (denied) {
    return (
      <WiPage title="Not available">
        <p className="text-[17px] text-slate-700">You don&apos;t have access to this project.</p>
        <Link href="/" className="mt-4 inline-block text-violet-700 hover:underline">
          ← Back to Home
        </Link>
      </WiPage>
    );
  }
  if (projectId && !projects && projectsError) {
    return (
      <WiPage title="Project unavailable">
        <ErrorBanner error={projectsError ?? queuesError} />
      </WiPage>
    );
  }

  return <WorkItemsContext.Provider value={ctx}>{children}</WorkItemsContext.Provider>;
}

/** Page frame: big slab title, subtitle, content. */
export function WiPage({
  title,
  subtitle,
  actions,
  children,
  wide,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main className={cx("pb-16 pt-14", wide ? "px-5" : "px-6")}>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-slab text-[32px] font-bold leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere] sm:text-[44px] sm:leading-none">{title}</h1>
          {subtitle && <div className="mt-5 text-[17px] text-slate-800">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </main>
  );
}
