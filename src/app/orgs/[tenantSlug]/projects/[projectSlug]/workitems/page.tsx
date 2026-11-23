"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { IconChevronDown, IconFilter, IconPaperclip, IconRefresh, IconSearch } from "@/components/icons";
import { ErrorBanner, Spinner, cx } from "@/components/ui";
import { Avatar, CopyButton, Popover, PurpleButton, StatusDot, useDebounced } from "@/components/workitems/bits";
import { WiPage, useWorkItems } from "@/components/workitems/WorkItemsShell";
import { wi } from "@/lib/api";
import { STATUS_META, type V2Response, type V2Row, WI_STATUSES, fmtDate, shortTrace, statusLabel } from "@/lib/workItems";

type SortCol = "incremented_display_id" | "created_at" | "updated_at" | "status" | "display_roots_id";
interface DateRange {
  from: string;
  to: string;
}

const PAGE_SIZES = [25, 50, 100];

export default function WorkItemsPage() {
  const { queue, queueId, queuesError } = useWorkItems();
  // Viewers are read only.
  const router = useRouter();
  const { paths } = useWorkItems();
  const [text, setText] = useState("");
  const search = useDebounced(text.trim());
  const [statuses, setStatuses] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<(string | null)[]>([]);
  const [created, setCreated] = useState<DateRange>({ from: "", to: "" });
  const [updated, setUpdated] = useState<DateRange>({ from: "", to: "" });
  const [sort, setSort] = useState<{ col: SortCol; desc: boolean }>({ col: "created_at", desc: true });
  // Paging lives in the URL (?page=0&pageSize=25), like v1, so a page can be linked and reloaded.
  const pathname = usePathname();
  const query = useSearchParams();
  const page = Math.max(Number(query.get("page")) || 0, 0);
  const requestedSize = Number(query.get("pageSize"));
  const pageSize = requestedSize >= 1 && requestedSize <= 1000 ? requestedSize : 25;
  const setPaging = (p: number, size: number) =>
    router.replace(`${pathname}?page=${p}&pageSize=${size}`, { scroll: false });
  const setPage = (v: number | ((p: number) => number)) => setPaging(typeof v === "function" ? v(page) : v, pageSize);
  const setPageSize = (size: number) => setPaging(0, size);
  const [error, setError] = useState<unknown>(null);

  const filters = useMemo(() => {
    // v1's body: {queueId, startRow, endRow}, plus search / filters / sort only when used.
    const f: Record<string, unknown> = { queueId };
    if (search) f.search = search;
    if (statuses.length) f.statuses = statuses;
    if (sort.col !== "created_at" || !sort.desc) f.sortModel = [{ colId: sort.col, sort: sort.desc ? "desc" : "asc" }];
    if (assignees.length) f.assigneeIds = assignees;
    if (created.from) f.createdAtStartDatetime = new Date(`${created.from}T00:00:00`).toISOString();
    if (created.to) f.createdAtEndDatetime = new Date(`${created.to}T23:59:59`).toISOString();
    if (updated.from) f.updatedAtStartDatetime = new Date(`${updated.from}T00:00:00`).toISOString();
    if (updated.to) f.updatedAtEndDatetime = new Date(`${updated.to}T23:59:59`).toISOString();
    return f;
  }, [queueId, statuses, sort, search, assignees, created, updated]);

  const key = queueId ? ["wi:v2", JSON.stringify(filters), page, pageSize] : null;
  const { data, isLoading, mutate, error: loadError } = useSWR<V2Response>(
    key,
    () => wi.post<V2Response>("/items/v2/searches", { ...filters, startRow: page * pageSize, endRow: (page + 1) * pageSize }),
    { refreshInterval: 15000, keepPreviousData: true },
  );
  // Status counts for the Status column filter: v1 reads them from the search response
  // (metadata.statuses); while a status filter is on, the last unfiltered counts are kept.
  const [unfiltered, setUnfiltered] = useState<Record<string, number> | undefined>(undefined);
  useEffect(() => {
    setUnfiltered(undefined);
  }, [queueId]);
  const latest = data?.metadata.statuses;
  useEffect(() => {
    if (latest && !statuses.length) setUnfiltered(latest);
  }, [latest, statuses.length]);
  const counts = { data: statuses.length ? unfiltered : (latest ?? unfiltered) };

  const total = data?.metadata.total_item_count ?? 0;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    if (page !== 0) setPage(0);
    fn(v);
  };

  return (
    <WiPage
      title="Work Items"
      subtitle={queue?.name ?? (queueId ? <Spinner /> : "No project available. Ask an administrator for access to a project.")}
      actions={
        <>
          <PurpleButton variant="ghost" onClick={() => mutate()} title="Refresh">
            <IconRefresh className="h-4 w-4" /> Refresh
          </PurpleButton>
        </>
      }
    >
      <ErrorBanner error={queuesError || loadError || error} onDismiss={() => setError(null)} />

      <div className="mb-12 flex flex-wrap items-center gap-4">
        <label className="flex h-[52px] w-full max-w-[950px] items-center gap-3 rounded-full border border-slate-300 px-5 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100">
          <IconSearch className="h-6 w-6 shrink-0 text-violet-700" strokeWidth={2.4} />
          <input
            value={text}
            onChange={(e) => resetPage(setText)(e.target.value)}
            placeholder="Enter Item ID, Client ID or Trace ID to search..."
            className="h-full w-full bg-transparent text-[17px] text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />
        </label>
        <span className="text-[17px] text-slate-700">
          {data ? `${total.toLocaleString()} result${total === 1 ? "" : "s"}` : isLoading ? "Searching…" : ""}
        </span>
        <ActiveFilters
          statuses={statuses}
          assignees={assignees}
          created={created}
          updated={updated}
          onClear={() => {
            setPage(0);
            setStatuses([]);
            setAssignees([]);
            setCreated({ from: "", to: "" });
            setUpdated({ from: "", to: "" });
          }}
        />
      </div>

      <div className="relative overflow-x-auto rounded-md border border-slate-200 scrollbar-thin">
        <table className="w-full min-w-[1100px] border-collapse text-[16px]">
          <thead>
            <tr className="h-[64px] bg-slate-100 text-left">
              <Th first onSort={() => toggleSort("incremented_display_id")} sorted={sort.col === "incremented_display_id" ? sort.desc : undefined}>
                Item ID
              </Th>
              <Th onSort={() => toggleSort("display_roots_id")} sorted={sort.col === "display_roots_id" ? sort.desc : undefined}>
                Client ID
              </Th>
              <Th>Trace ID</Th>
              <Th filter={<StatusFilter value={statuses} counts={counts.data} onChange={resetPage(setStatuses)} />} active={statuses.length > 0}>
                Status
              </Th>
              <Th
                filter={<DateFilter label="Created" value={created} onChange={resetPage(setCreated)} sortDesc={sort.col === "created_at" ? sort.desc : undefined} onSort={(desc) => setSort({ col: "created_at", desc })} />}
                active={!!(created.from || created.to)}
                sorted={sort.col === "created_at" ? sort.desc : undefined}
              >
                Created At
              </Th>
              <Th
                filter={<DateFilter label="Updated" value={updated} onChange={resetPage(setUpdated)} sortDesc={sort.col === "updated_at" ? sort.desc : undefined} onSort={(desc) => setSort({ col: "updated_at", desc })} />}
                active={!!(updated.from || updated.to)}
                sorted={sort.col === "updated_at" ? sort.desc : undefined}
              >
                Updated At
              </Th>
              <Th filter={<AssigneeFilter value={assignees} onChange={resetPage(setAssignees)} />} active={assignees.length > 0}>
                Assigned To
              </Th>
              <th className="sticky right-0 z-10 w-[150px] whitespace-nowrap bg-slate-100 px-3 text-left font-normal text-slate-900 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.25)]">
                Documents
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <Row key={r.incremented_display_id} row={r} onOpen={() => paths && router.push(paths.item(r.trace_id, "details"))} onChanged={() => mutate()} onError={setError} />
            ))}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                  No work items match.
                </td>
              </tr>
            )}
            {!data && isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <Spinner className="mx-auto h-6 w-6 text-violet-500" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(0);
              setPageSize(Number(e.target.value));
            }}
            className="rounded border border-slate-300 px-2 py-1"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span>
            {total ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total.toLocaleString()}` : "0 of 0"}
          </span>
          <PurpleButton variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </PurpleButton>
          <PurpleButton variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </PurpleButton>
        </div>
      </div>

    </WiPage>
  );

  function toggleSort(col: SortCol) {
    setSort((s) => (s.col === col ? { col, desc: !s.desc } : { col, desc: col !== "display_roots_id" }));
  }
}

function Th({
  children,
  filter,
  active,
  sorted,
  onSort,
  first,
}: {
  children: React.ReactNode;
  filter?: React.ReactNode;
  active?: boolean;
  sorted?: boolean;
  onSort?: () => void;
  first?: boolean;
}) {
  return (
    <th className="relative whitespace-nowrap px-3 font-normal text-slate-900">
      {!first && <span className="absolute left-0 top-1/2 h-8 w-[2px] -translate-y-1/2 bg-violet-600" aria-hidden />}
      <span className="flex items-center justify-between gap-2">
        <button type="button" onClick={onSort} disabled={!onSort} className={cx("flex items-center gap-1 text-left", onSort && "hover:text-violet-700")}>
          {children}
          {sorted !== undefined && <IconChevronDown className={cx("h-4 w-4 text-violet-600", !sorted && "rotate-180")} />}
        </button>
        {filter}
        {active && <span className="absolute right-1 top-3 h-2 w-2 rounded-full bg-violet-600" aria-label="filtered" />}
      </span>
    </th>
  );
}

function FilterTrigger({ toggle, open }: { toggle: () => void; open: boolean }) {
  return (
    <button type="button" onClick={toggle} className={cx("rounded p-1 hover:bg-slate-200", open && "bg-slate-200")} aria-label="Filter">
      <IconFilter className="h-5 w-5" strokeWidth={2.2} />
    </button>
  );
}

function StatusFilter({ value, counts, onChange }: { value: string[]; counts?: Record<string, number>; onChange: (v: string[]) => void }) {
  return (
    <Popover trigger={(open, toggle) => <FilterTrigger open={open} toggle={toggle} />}>
      {(close) => (
        <div className="space-y-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</div>
          {WI_STATUSES.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
              <input
                type="checkbox"
                className="accent-violet-600"
                checked={value.includes(s)}
                onChange={(e) => onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s))}
              />
              <span className={cx("h-3 w-3 rounded-full", STATUS_META[s].dot)} />
              <span className="flex-1">{statusLabel(s)}</span>
              <span className="text-xs text-slate-500">{counts?.[s] ?? ""}</span>
            </label>
          ))}
          <div className="flex justify-between border-t border-slate-100 pt-2">
            <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => onChange([])}>
              Clear
            </button>
            <button className="text-xs font-semibold text-violet-700" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

function DateFilter({
  label,
  value,
  onChange,
  sortDesc,
  onSort,
}: {
  label: string;
  value: DateRange;
  onChange: (v: DateRange) => void;
  sortDesc?: boolean;
  onSort: (desc: boolean) => void;
}) {
  return (
    <Popover trigger={(open, toggle) => <FilterTrigger open={open} toggle={toggle} />}>
      {(close) => (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="flex gap-2">
            <button onClick={() => onSort(true)} className={cx("flex-1 rounded border px-2 py-1 text-xs", sortDesc === true ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200")}>
              Newest first
            </button>
            <button onClick={() => onSort(false)} className={cx("flex-1 rounded border px-2 py-1 text-xs", sortDesc === false ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200")}>
              Oldest first
            </button>
          </div>
          <label className="block text-xs text-slate-600">
            From
            <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="block text-xs text-slate-600">
            To
            <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <div className="flex justify-between border-t border-slate-100 pt-2">
            <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => onChange({ from: "", to: "" })}>
              Clear
            </button>
            <button className="text-xs font-semibold text-violet-700" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

function AssigneeFilter({ value, onChange }: { value: (string | null)[]; onChange: (v: (string | null)[]) => void }) {
  const { users } = useWorkItems();
  const options: { id: string | null; name: string }[] = [{ id: null, name: "Unassigned" }, ...users];
  return (
    <Popover trigger={(open, toggle) => <FilterTrigger open={open} toggle={toggle} />}>
      {(close) => (
        <div className="space-y-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</div>
          {options.map((o) => (
            <label key={o.id ?? "none"} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
              <input
                type="checkbox"
                className="accent-violet-600"
                checked={value.includes(o.id)}
                onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
              />
              {o.name}
            </label>
          ))}
          <div className="flex justify-between border-t border-slate-100 pt-2">
            <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => onChange([])}>
              Clear
            </button>
            <button className="text-xs font-semibold text-violet-700" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

function ActiveFilters({
  statuses,
  assignees,
  created,
  updated,
  onClear,
}: {
  statuses: string[];
  assignees: (string | null)[];
  created: DateRange;
  updated: DateRange;
  onClear: () => void;
}) {
  const n = (statuses.length ? 1 : 0) + (assignees.length ? 1 : 0) + (created.from || created.to ? 1 : 0) + (updated.from || updated.to ? 1 : 0);
  if (!n) return null;
  return (
    <button onClick={onClear} className="rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-700 hover:bg-violet-100">
      {n} filter{n === 1 ? "" : "s"} · Clear
    </button>
  );
}

function Row({ row: r, onOpen, onChanged, onError }: { row: V2Row; onOpen: () => void; onChanged: () => void; onError: (e: unknown) => void }) {
  const { users, me, paths } = useWorkItems();
  const [saving, setSaving] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  async function assign(assigneeId: string) {
    setSaving(true);
    try {
      await wi.put("/items/assign", {
        items: [{ work_item_id: r.trace_id, assignee_id: assigneeId || null, assigned_by: me?.id ?? "ui" }],
      });
      onChanged();
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  }
  return (
    <tr onClick={onOpen} className="group h-[67px] cursor-pointer border-t border-slate-200 hover:bg-violet-50">
      <td className="border-r border-slate-200 px-3">{r.incremented_display_id}</td>
      <td className="max-w-[320px] truncate border-r border-slate-200 px-3" title={r.display_roots_id ?? ""}>
        {r.display_roots_id}
      </td>
      <td className="border-r border-slate-200 px-3">
        <span className="flex items-center justify-between gap-2">
          <span>{shortTrace(r.trace_id)}</span>
          <span onClick={stop}>
            <CopyButton value={r.trace_id} label="Copy trace id" />
          </span>
        </span>
      </td>
      <td className="border-r border-slate-200 px-3 whitespace-nowrap">
        <StatusDot status={r.status} detail={r.status === "requires_review" || r.status === "system_exception" ? r.exception_details : null} />
      </td>
      <td className="whitespace-nowrap border-r border-slate-200 px-3">{fmtDate(r.created_at)}</td>
      <td className="whitespace-nowrap border-r border-slate-200 px-3">{fmtDate(r.updated_at)}</td>
      <td className="border-r border-slate-200 px-3" onClick={stop}>
        <span className="flex items-center gap-2">
          <Avatar name={r.assignee_name} />
          <span className="relative min-w-0 flex-1">
            <select
              value={r.assignee_id ?? ""}
              disabled={saving}
              onChange={(e) => assign(e.target.value)}
              className="w-full max-w-[160px] cursor-pointer appearance-none truncate bg-transparent pr-6 text-[16px] text-slate-900 focus:outline-none"
              aria-label="Assign to"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              {r.assignee_id && !users.some((u) => u.id === r.assignee_id) && <option value={r.assignee_id}>{r.assignee_name ?? r.assignee_id}</option>}
            </select>
            <IconChevronDown className="pointer-events-none absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </span>
        </span>
      </td>
      {/* Pinned to the right edge: opening a document never needs a horizontal scroll. */}
      <td className="sticky right-0 bg-white px-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.25)] group-hover:bg-violet-50" onClick={stop}>
        <span className="flex items-center gap-1">
          <Link
            href={paths ? paths.item(r.trace_id, "documents") : "/"}
            className="relative inline-flex rounded p-1.5 text-violet-700 hover:bg-violet-100"
            title={`${r.file_count} file${r.file_count === 1 ? "" : "s"}: open the item's documents`}
          >
            <IconPaperclip className="h-6 w-6" />
            {r.file_count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white">
                {r.file_count}
              </span>
            )}
          </Link>
          {paths && r.package_details.length === 1 && (
            <Link
              href={paths.document(r.trace_id, r.package_details[0].package_id)}
              className="whitespace-nowrap rounded px-2 py-1 text-sm font-semibold text-violet-700 hover:bg-violet-100"
              title={`Open ${r.package_details[0].file_name}`}
            >
              Open
            </Link>
          )}
        </span>
      </td>
    </tr>
  );
}
