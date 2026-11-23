// The current project for the work item screens comes from the URL (/orgs/{tenant}/projects/
// {project}/...), like v1. Projects are the tenant's projects (v1 roots-auth:
// GET /api/roots-auth/tenant/{tenant}/projects); each has its own work item queue (queue_id),
// which the screens send to roots-wim / roots-queue as queueId. A project is not tied to a
// decision tree. Only members of the tenant can list its projects.
//
// Projects created before queue_id existed find their queue by the queue's old link
// (queue.projectId == project id).

import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { fetcher } from "@/lib/api";
import { type ProjectPaths, projectPaths } from "@/lib/paths";
import { useSession } from "@/lib/session";
import type { Customer, TenantProject } from "@/lib/types";
import type { Queue } from "@/lib/workItems";

const LAST_PROJECT_KEY = "agenthub.lastProject";

export function rememberProject(tenantId: string, projectId: string) {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, JSON.stringify({ tenantId, projectId }));
  } catch {
    /* storage unavailable */
  }
}

function lastProject(): { tenantId?: string; projectId?: string } {
  try {
    const raw = window.localStorage.getItem(LAST_PROJECT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** A tenant project with its queue resolved. */
export type ProjectWithQueue = TenantProject & { queueId: string | null };

export interface QueueSelection {
  /** Queues of the tenant's projects (what the user may open). */
  queues: Queue[] | undefined;
  queuesError: unknown;
  projectsError: unknown;
  mutateQueues: KeyedMutator<Queue[]>;
  queueId: string | null;
  queue: Queue | undefined;
  /** Open another project of the tenant (by its queue id, as the queue picker does). */
  setQueueId: (id: string) => void;
  /** Tenant and project in the URL (null outside project pages). */
  tenantId: string | null;
  projectId: string | null;
  /** The tenant's projects (the tenant in the URL, else the last used / first one). */
  projects: ProjectWithQueue[] | undefined;
  project: ProjectWithQueue | undefined;
  mutateProjects: () => void;
  /** Links for the project in the URL, else the last used / first available project. */
  paths: ProjectPaths | null;
}

export function useQueueSelection(): QueueSelection {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ tenantSlug?: string; projectSlug?: string }>();
  const session = useSession();
  const tenantId = params.tenantSlug?.toLowerCase() ?? null;
  const projectId = params.projectSlug?.toLowerCase() ?? null;

  // Outside a tenant's pages the top bar's links use the last tenant (or the first one).
  const customers = useSWR<Customer[]>(session.data && !tenantId ? "dt:/v1/customers" : null, fetcher);
  const last = typeof window === "undefined" ? {} : lastProject();
  const scopeTenant =
    tenantId ??
    (customers.data?.some((c) => c.id === last.tenantId) ? last.tenantId! : (customers.data?.[0]?.id ?? null));

  const tenantProjects = useSWR<TenantProject[]>(
    session.data && scopeTenant ? `ra:/tenant/${scopeTenant}/projects` : null,
    fetcher,
  );
  const raw = useSWR<Queue[]>("wi:/queues?details=true", fetcher, { refreshInterval: 30000 });

  const projects = useMemo<ProjectWithQueue[] | undefined>(() => {
    if (!tenantProjects.data) return undefined;
    return tenantProjects.data.map((p) => ({
      ...p,
      queueId: p.queue_id ?? raw.data?.find((q) => q.projectId === p.project_id)?.id ?? null,
    }));
  }, [tenantProjects.data, raw.data]);

  const queues = useMemo(() => {
    if (!raw.data || !projects) return undefined;
    const ids = new Set(projects.map((p) => p.queueId).filter(Boolean));
    return raw.data.filter((q) => ids.has(q.id));
  }, [raw.data, projects]);

  const fallback = useMemo(() => {
    if (!projects?.length) return undefined;
    return projects.find((p) => p.project_id === last.projectId) ?? projects.find((p) => p.queueId) ?? projects[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);
  const project = projectId ? projects?.find((p) => p.project_id === projectId) : fallback;
  const queue = project?.queueId ? raw.data?.find((q) => q.id === project.queueId) : undefined;
  const paths = project ? projectPaths(project.tenant_id, project.project_id) : null;

  const setQueueId = useCallback(
    (id: string) => {
      const p = projects?.find((x) => x.queueId === id);
      if (!p) return;
      rememberProject(p.tenant_id, p.project_id);
      const next = projectPaths(p.tenant_id, p.project_id);
      if (pathname.endsWith("/documents")) router.push(next.documents);
      else if (pathname.includes("/premium-steps/document-processing")) router.push(next.library);
      else router.push(next.workitems);
    },
    [projects, router, pathname],
  );

  return {
    queues,
    queuesError: raw.error ?? tenantProjects.error,
    projectsError: tenantProjects.error,
    mutateQueues: raw.mutate,
    queueId: queue?.id ?? null,
    queue,
    setQueueId,
    tenantId,
    projectId,
    projects,
    project,
    mutateProjects: () => void tenantProjects.mutate(),
    paths,
  };
}
