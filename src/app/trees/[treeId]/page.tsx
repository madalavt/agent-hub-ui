"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { TreeEditor } from "@/components/tree/TreeEditor";
import { ErrorBanner, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { canWriteCustomer, useSession } from "@/lib/session";
import type { MlModel, TreeGraph } from "@/lib/types";

export default function TreePage() {
  const { treeId } = useParams<{ treeId: string }>();
  const session = useSession();
  // No revalidation: the editor owns the tree once loaded, so a refetch must not clobber edits.
  const opts = { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false };
  const tree = useSWR<TreeGraph>(`dt:/v1/trees/${treeId}`, fetcher, opts);
  const models = useSWR<MlModel[]>("dt:/v1/mlmodels", fetcher, opts);

  if (tree.error || models.error)
    return (
      <div className="p-8">
        <ErrorBanner error={tree.error || models.error} />
      </div>
    );
  if (!tree.data || !models.data)
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  const ownerId = tree.data.customer_id;
  const canEdit = ownerId
    ? canWriteCustomer(session.data, ownerId)
    : session.data?.role === "admin" ||
      tree.data.projects.some((p) => canWriteCustomer(session.data, p.customer_id));
  return <TreeEditor key={tree.data.id} initial={tree.data} models={models.data} readOnly={!canEdit} />;
}
