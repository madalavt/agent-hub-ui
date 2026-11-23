"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { IconAlert, IconChevronDown, IconFile } from "@/components/icons";
import { cx } from "@/components/ui";
import { useWorkItems } from "@/components/workitems/WorkItemsShell";
import { fetcher, wi } from "@/lib/api";
import type { ProjectPaths } from "@/lib/paths";
import type { LinkedPackage, V2Response, V2Row } from "@/lib/workItems";

// Which screen of a work item is open. "document" is the summary of one document (under Documents).
export type WorkspaceView = "documents" | "details" | "document";

/**
 * Left-hand navigation used across a work item: back to the queue, every item in the queue (the
 * current one expanded into Details and Documents), then the page content.
 */
export function ItemWorkspace({ itemId, view, children }: { itemId: string; view: WorkspaceView; children: React.ReactNode }) {
  const { queueId, paths } = useWorkItems();
  const list = useSWR<V2Response>(queueId ? ["wi:workspace", queueId] : null, () =>
    wi.post<V2Response>("/items/v2/searches", {
      queueId,
      statuses: [],
      sortModel: [{ colId: "created_at", sort: "desc" }],
      startRow: 0,
      endRow: 200,
    }),
  );
  const docs = useSWR<LinkedPackage[]>(itemId ? `an:/${itemId}/documents` : null, fetcher);
  // A retried item has several rows with the same trace id; the newest one is "current".
  // URLs may carry the trace id with or without dashes.
  const currentDisplayId = list.data?.rows.find((r) => sameId(r.trace_id, itemId))?.incremented_display_id;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white lg:sticky lg:top-4 lg:w-[300px]">
        <Link
          href={paths?.workitems ?? "/"}
          className="flex items-center gap-2 border-b border-slate-200 bg-violet-50 px-4 py-3 text-[15px] font-semibold text-violet-800 hover:bg-violet-100"
        >
          ← Back to Work Items
        </Link>
        <ul className="max-h-64 overflow-y-auto lg:max-h-[calc(100vh-150px)]">
          {(list.data?.rows ?? []).map((row) =>
            row.incremented_display_id === currentDisplayId ? (
              <CurrentItem
                key={row.incremented_display_id}
                row={row}
                paths={paths}
                view={view}
                documentCount={docs.data?.length}
              />
            ) : (
              <li key={row.incremented_display_id} className="border-b border-slate-200">
                <Link
                  href={paths ? paths.item(row.trace_id, "documents") : "/"}
                  className="flex items-center justify-between px-4 py-4 text-[17px] font-semibold text-slate-900 hover:bg-slate-50"
                >
                  {row.incremented_display_id}
                  <IconChevronDown className="h-4 w-4 text-violet-600" />
                </Link>
              </li>
            ),
          )}
          {list.isLoading && <li className="px-4 py-4 text-sm text-slate-500">Loading items…</li>}
        </ul>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function CurrentItem({
  row,
  paths,
  view,
  documentCount,
}: {
  row: V2Row;
  paths: ProjectPaths | null;
  view: WorkspaceView;
  documentCount: number | undefined;
}) {
  const [open, setOpen] = useState(true);
  const link = (active: boolean) =>
    cx("flex items-center gap-3 px-4 py-3 pl-6 text-[15px]", active ? "bg-violet-50 font-semibold text-violet-800" : "text-slate-700 hover:bg-slate-50");
  return (
    <li className="border-b border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between bg-violet-50/70 px-4 py-4 text-left text-[17px] font-semibold text-violet-900"
      >
        {row.incremented_display_id}
        <IconChevronDown className={cx("h-4 w-4 text-violet-600 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="pb-2">
          <Link href={paths ? paths.item(row.trace_id, "details") : "/"} className={link(view === "details")}>
            <IconAlert className="h-5 w-5 text-violet-600" />
            Details
          </Link>
          <Link
            href={paths ? paths.item(row.trace_id, "documents") : "/"}
            className={link(view === "documents" || view === "document")}
          >
            <IconFile className="h-5 w-5 text-violet-600" />
            Documents
            {documentCount !== undefined && (
              <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">{documentCount}</span>
            )}
          </Link>
        </div>
      )}
    </li>
  );
}

const sameId = (a: string, b: string) => a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
