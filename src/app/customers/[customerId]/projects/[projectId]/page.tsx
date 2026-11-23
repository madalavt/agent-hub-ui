"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { IconFile, IconRefresh, IconTrash, IconTree } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { UploadDropzone } from "@/components/UploadDropzone";
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { ann, ex, fetcher } from "@/lib/api";
import { formatBytes, formatDuration, relativeTime } from "@/lib/format";
import type { Customer, Package, Project } from "@/lib/types";

export default function ProjectPage() {
  const { customerId, projectId } = useParams<{ customerId: string; projectId: string }>();
  const router = useRouter();
  const [actionError, setActionError] = useState<unknown>(null);
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);
  const customer = useSWR<Customer>(`dt:/v1/customers/${customerId}`, fetcher);
  const project = useSWR<Project>(`dt:/v1/projects/${projectId}`, fetcher);
  const packages = useSWR<Package[]>(`ex:/v1/projects/${projectId}/packages`, fetcher, {
    // Poll quickly while anything is processing, slowly otherwise.
    refreshInterval: (data) => (data?.some((p) => p.display_status === "processing") ? 3000 : 15000),
  });

  const p = project.data;
  const list = packages.data ?? [];
  const counts = {
    processing: list.filter((x) => x.display_status === "processing").length,
    completed: list.filter((x) => x.display_status === "completed").length,
    failed: list.filter((x) => x.display_status === "failed").length,
  };
  const base = `/customers/${customerId}/projects/${projectId}`;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Customers", href: "/" },
          { label: customer.data?.name ?? "…", href: `/customers/${customerId}` },
          { label: p?.name ?? "…" },
        ]}
        title={p?.name ?? <Spinner />}
        subtitle={
          p && (
            <span className="flex flex-wrap items-center gap-2">
              {p.description && <span>{p.description}</span>}
              {p.tree_id ? (
                <Link href={`/trees/${p.tree_id}`}>
                  <Badge tone="indigo">
                    <IconTree className="h-3 w-3" /> {p.tree_name}
                  </Badge>
                </Link>
              ) : (
                <Badge tone="amber">No decision tree assigned</Badge>
              )}
            </span>
          )
        }
        actions={
          p?.tree_id && (
            <Link
              href={`/trees/${p.tree_id}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
            >
              <IconTree /> Edit decision tree
            </Link>
          )
        }
      />
      <ErrorBanner error={project.error || packages.error || actionError} onDismiss={() => setActionError(null)} />

      <div className="mb-6">
        <UploadDropzone
          projectId={projectId}
          disabled={!p?.tree_id}
          onUploaded={(created) => packages.mutate([...created, ...list], { revalidate: true })}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
        <div className="flex items-center gap-2 text-xs">
          <Badge tone="amber">{counts.processing} processing</Badge>
          <Badge tone="green">{counts.completed} completed</Badge>
          <Badge tone="red">{counts.failed} failed</Badge>
        </div>
      </div>

      {packages.isLoading && <Spinner className="h-5 w-5 text-slate-400" />}
      {packages.data && list.length === 0 && (
        <EmptyState icon={<IconFile />} title="No documents yet" description="Upload a document above. Extraction starts automatically." />
      )}
      {list.length > 0 && (
        <Card className="overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Documents</th>
                <th className="px-4 py-2.5">Rows</th>
                <th className="px-4 py-2.5">Uploaded</th>
                <th className="px-4 py-2.5">Time</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((pkg) => {
                const rows = pkg.documents.reduce(
                  (acc, d) => acc + Object.values(d.table_row_counts).reduce((a, b) => a + b, 0),
                  0,
                );
                const types = Array.from(new Set(pkg.documents.map((d) => d.document_type ?? "—")));
                const href = `${base}/documents/${pkg.package_id}`;
                return (
                  <tr key={pkg.package_id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(href)}>
                    <td className="max-w-xs px-4 py-3">
                      <div className="flex items-center gap-2">
                        <IconFile className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <Link href={href} className="block truncate font-medium text-slate-900 hover:text-indigo-700" onClick={(e) => e.stopPropagation()}>
                            {pkg.file_name}
                          </Link>
                          <div className="text-xs text-slate-500">
                            #{pkg.package_id} · {formatBytes(pkg.file_size)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pkg.display_status} queued={pkg.status === "UPLOADED" && pkg.attempts === 0} />
                      {pkg.display_status === "failed" && pkg.error && (
                        <div className="mt-1 max-w-[220px] truncate text-xs text-red-600" title={pkg.error}>
                          {pkg.error}
                        </div>
                      )}
                      {pkg.display_status === "processing" && pkg.attempts > 1 && (
                        <div className="mt-1 text-xs text-amber-600">attempt {pkg.attempts}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {pkg.documents.length ? (
                        <div className="flex flex-wrap gap-1">
                          {types.map((t) => (
                            <Badge key={t} tone={/^others?$|^—$/i.test(t) ? "slate" : "sky"}>
                              {t}
                            </Badge>
                          ))}
                          {pkg.documents.length > 1 && <span className="text-xs text-slate-500">×{pkg.documents.length}</span>}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{pkg.documents.length ? rows : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{relativeTime(pkg.created_at)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDuration(pkg.timings?.total)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {pkg.display_status !== "processing" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={reprocessingId === pkg.package_id}
                            title="Run extraction again with the current tree"
                            onClick={async () => {
                              setReprocessingId(pkg.package_id);
                              setActionError(null);
                              try {
                                await ann.post(`/${pkg.package_id}/reprocess`);
                                await packages.mutate();
                              } catch (err) {
                                setActionError(err);
                              } finally {
                                setReprocessingId(null);
                              }
                            }}
                          >
                            <IconRefresh />
                          </Button>
                        )}
                        {pkg.status !== "PROCESSING" && (
                          <ConfirmButton
                            size="sm"
                            confirmLabel="Delete?"
                            onError={setActionError}
                            onConfirm={async () => {
                              setActionError(null);
                              await ex.del(`/v1/packages/${pkg.package_id}`);
                              await packages.mutate();
                            }}
                          >
                            <IconTrash />
                          </ConfirmButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
