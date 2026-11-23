"use client";

// Configurator (/.../premium-steps/document-processing/{configurationId}/configurator, like v1):
// the configuration from /api/roots-igpt/configuration/{id}, edited in the decision tree editor.
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { TreeEditor } from "@/components/tree/TreeEditor";
import { ErrorBanner, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { projectPaths } from "@/lib/paths";
import { canWriteCustomer, useSession } from "@/lib/session";
import type { IgptConfiguration, MlModel, TreeGraph } from "@/lib/types";

export default function ConfiguratorPage() {
  const { tenantSlug, projectSlug, configurationId } = useParams<{
    tenantSlug: string;
    projectSlug: string;
    configurationId: string;
  }>();
  const session = useSession();
  const library = projectPaths(tenantSlug, projectSlug).library;
  // No revalidation: the editor owns the tree once loaded, so a refetch must not clobber edits.
  const opts = { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false };
  const cfg = useSWR<IgptConfiguration>(`ig:/configuration/${configurationId}`, fetcher, opts);
  const treeId = cfg.data?.configuration.tree_id;
  const tree = useSWR<TreeGraph>(treeId ? `dt:/v1/trees/${treeId}` : null, fetcher, opts);
  // Like v1: GET /api/roots-igpt/mlmodels -> {mlmodels: [{id, name, standard, type}]}
  const models = useSWR<{ mlmodels: MlModel[] }>("ig:/mlmodels", fetcher, opts);

  const error = cfg.error || tree.error || models.error;
  if (error)
    return (
      <div className="p-8">
        <ErrorBanner error={error} />
      </div>
    );
  if (cfg.data && !treeId)
    return (
      <div className="p-10 text-[17px] text-slate-700">
        {cfg.data.configuration.name} has no decision tree yet. Assign one from the configuration&apos;s edit dialog on Document Processing.{" "}
        <Link href={library} className="text-violet-700 hover:underline">
          Back to Document Processing
        </Link>
      </div>
    );
  if (!tree.data || !models.data)
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  const canEdit = canWriteCustomer(session.data, tenantSlug);
  return <TreeEditor key={tree.data.id} initial={tree.data} models={models.data.mlmodels} backHref={library} backLabel="Document Processing" readOnly={!canEdit} />;
}
