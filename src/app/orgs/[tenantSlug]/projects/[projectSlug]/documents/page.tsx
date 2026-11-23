"use client";

// The project's documents, like v1: POST /api/roots-queue/docs/searches with
// {queueId, project_id, tenant_id, startRow, endRow} returns the documents of the project's
// queue (columns, rows, counts per status); each row names the decision tree it ran.

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { IconSearch, IconUpload } from "@/components/icons";
import { UploadDocumentsModal } from "@/components/workitems/UploadDocumentsModal";
import { ErrorBanner, Spinner, cx } from "@/components/ui";
import { PurpleButton, useDebounced } from "@/components/workitems/bits";
import { WiPage, useWorkItems } from "@/components/workitems/WorkItemsShell";
import { wi } from "@/lib/api";
import { PACKAGE_STATUS, fmtDate } from "@/lib/workItems";

interface DocRow {
  id: number;
  name: string;
  file_name: string;
  status: number;
  decision_tree: string | null;
  decision_tree_id: string | null;
  work_item_id: string | null;
  last_modified_on: string | null;
  created_on: string | null;
}

interface DocsResponse {
  rows: DocRow[];
  columns: { id: number; field: keyof DocRow; headerName: string }[];
  metadata: { total_item_count: number; statuses: Record<string, number> };
}

// v1 status names (metadata.statuses) and their codes
const STATUS_CODE: Record<string, number> = {
  holding: 0,
  uploaded: 1,
  processed: 2,
  scoring: 3,
  in_scoring: 4,
  qa: 5,
  in_qa: 6,
  completed: 7,
  processing: 8,
  failed: 99,
};

const PAGE = 50;

export default function DocumentsPage() {
  const { queue, queueId, paths, projectId, tenantId, project } = useWorkItems();
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState("");
  const search = useDebounced(text.trim());
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [queueId]);
  const docs = useSWR<DocsResponse>(
    projectId && queueId ? ["docs", queueId, search, status, page] : null,
    () =>
      wi.post<DocsResponse>("/docs/searches", {
        queueId,
        project_id: projectId,
        tenant_id: tenantId,
        startRow: page * PAGE,
        endRow: (page + 1) * PAGE,
        ...(search ? { search } : {}),
        ...(status ? { statuses: [status] } : {}),
      }),
    { refreshInterval: 20000, keepPreviousData: true },
  );
  const total = docs.data?.metadata.total_item_count ?? 0;
  const counts = docs.data?.metadata.statuses ?? {};
  const columns = docs.data?.columns ?? [];

  function cell(r: DocRow, field: keyof DocRow) {
    switch (field) {
      case "status": {
        const st = PACKAGE_STATUS[r.status];
        return <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", st?.tone ?? "bg-slate-100")}>{st?.label ?? r.status}</span>;
      }
      case "work_item_id":
        return r.work_item_id && paths ? (
          <Link href={paths.item(r.work_item_id, "documents")} className="font-mono text-sm text-violet-700 hover:underline">
            {r.work_item_id.slice(0, 8)}…
          </Link>
        ) : (
          <span className="text-slate-400">—</span>
        );
      case "last_modified_on":
      case "created_on":
        return <span className="whitespace-nowrap text-sm text-slate-600">{fmtDate(r[field])}</span>;
      case "id":
        return <span className="font-mono text-sm">{r.id}</span>;
      default:
        return <span className="block max-w-[320px] truncate" title={String(r[field] ?? "")}>{String(r[field] ?? "—")}</span>;
    }
  }

  return (
    <WiPage
      title="Documents"
      subtitle={queue?.name ?? ""}
      actions={
        queueId &&
        tenantId && (
          <PurpleButton onClick={() => setUploading(true)}>
            <IconUpload className="h-4 w-4" /> Upload
          </PurpleButton>
        )
      }
    >
      {queueId && tenantId && (
        <UploadDocumentsModal
          open={uploading}
          onClose={() => setUploading(false)}
          onUploaded={() => docs.mutate()}
          tenantId={tenantId}
          queueId={queueId}
          projectName={project?.display_name ?? queue?.name ?? "Project"}
          defaultConfig={queue?.projectId ?? null}
          paths={paths}
        />
      )}
      <ErrorBanner error={docs.error} />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="flex h-[52px] w-full max-w-[460px] items-center gap-3 rounded-full border border-slate-300 px-5 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100">
          <IconSearch className="h-6 w-6 shrink-0 text-violet-700" strokeWidth={2.4} />
          <input
            value={text}
            onChange={(e) => (setPage(0), setText(e.target.value))}
            placeholder="File name…"
            className="h-full w-full bg-transparent text-[16px] placeholder:text-slate-500 focus:outline-none"
          />
        </label>
        <span className="text-[17px] text-slate-700">{docs.data ? `${total.toLocaleString()} documents` : ""}</span>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(counts)
          .filter(([, n]) => n > 0)
          .map(([name, n]) => {
            const st = PACKAGE_STATUS[STATUS_CODE[name]];
            const active = status === name;
            return (
              <button
                key={name}
                onClick={() => (setPage(0), setStatus(active ? null : name))}
                className={cx(
                  "rounded-full px-3 py-1 text-sm ring-1",
                  active ? "bg-violet-600 text-white ring-violet-600" : cx(st?.tone ?? "bg-slate-100", "ring-transparent hover:ring-violet-300"),
                )}
              >
                {st?.label ?? name} · {n.toLocaleString()}
              </button>
            );
          })}
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200 scrollbar-thin">
        <table className="w-full min-w-[1100px] text-[15px]">
          <thead className="bg-slate-100 text-left text-slate-800">
            <tr className="h-14">
              {columns.map((c) => (
                <th key={c.id} className="px-4 font-normal">
                  {c.headerName}
                </th>
              ))}
              <th className="px-4" />
            </tr>
          </thead>
          <tbody>
            {docs.data?.rows.map((r) => (
              <tr key={r.id} className="h-14 border-t border-slate-200">
                {columns.map((c) => (
                  <td key={c.id} className="px-4">
                    {cell(r, c.field)}
                  </td>
                ))}
                <td className="px-4 text-right">
                  {r.work_item_id && paths && (
                    <Link href={paths.document(r.work_item_id, r.id)}>
                      <PurpleButton variant="outline">Open</PurpleButton>
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {docs.data?.rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-14 text-center text-slate-500">
                  No documents.
                </td>
              </tr>
            )}
            {!queueId && queue === undefined && projectId && (
              <tr>
                <td colSpan={9} className="px-4 py-14 text-center text-slate-500">
                  This project has no work item queue yet.
                </td>
              </tr>
            )}
            {!docs.data && projectId && queueId && (
              <tr>
                <td colSpan={9} className="py-14 text-center">
                  <Spinner className="mx-auto h-6 w-6 text-violet-500" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3 text-sm text-slate-600">
        {total ? `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, total)} of ${total.toLocaleString()}` : ""}
        <PurpleButton variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </PurpleButton>
        <PurpleButton variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
          Next
        </PurpleButton>
      </div>
    </WiPage>
  );
}
