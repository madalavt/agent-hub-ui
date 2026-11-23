"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { IconDownload, IconExternal, IconLink, IconLock, IconRefresh, IconTrash, IconUpload, IconUser, IconX } from "@/components/icons";
import { ErrorBanner, Spinner, cx } from "@/components/ui";
import { CopyButton, Popover, PurpleButton, StatusDot } from "@/components/workitems/bits";
import { ItemWorkspace } from "@/components/workitems/ItemWorkspace";
import { WiPage, useWorkItems } from "@/components/workitems/WorkItemsShell";
import { ann, fetcher, wi } from "@/lib/api";
import { projectPaths } from "@/lib/paths";
import type { Project } from "@/lib/types";
import {
  type ItemFile,
  type ItemInfo,
  type LinkedPackage,
  PACKAGE_STATUS,
  MANUAL_LABEL,
  STATUS_META,
  manualTargets,
  statusLabel,
} from "@/lib/workItems";

// Two screens, like v1's /workitems/{traceId}/documents and /workitems/{traceId}/details:
// Documents (reached from the list's paperclip) and Details (summary and the item's data,
// reporting, notes, files and history).
export type View = "documents" | "details";
const DOC_DOT: Record<number, string> = {
  0: "bg-slate-400",
  1: "bg-slate-400",
  2: "bg-sky-500",
  3: "bg-red-500",
  4: "bg-amber-500",
  5: "bg-violet-500",
  6: "bg-amber-500",
  7: "bg-emerald-500",
  8: "bg-amber-500",
  99: "bg-red-500",
};

export function WorkItemPage({ view }: { view: View }) {
  const { workitemId: itemId } = useParams<{ workitemId: string }>();
  const router = useRouter();
  const { queues, users, me, paths, projectId, projects } = useWorkItems();
  const tenantId = projects?.[0]?.tenant_id ?? null;
  const item = useSWR<ItemInfo>(`wi:/items/${itemId}`, fetcher, { refreshInterval: 10000 });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const it = item.data;
  const queue = queues?.find((q) => q.id === it?.queue);
  const listHref = paths?.workitems ?? "/";

  // An item opened under another project's URL: go to the project whose queue it is in.
  useEffect(() => {
    const p = it ? projects?.find((x) => x.queueId === it.queue) : undefined;
    if (it && p && projectId && p.project_id !== projectId) router.replace(projectPaths(p.tenant_id, p.project_id).item(it.id, view));
  }, [it, projects, projectId, view, router]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await item.mutate();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  // Only items of projects (queues) the user may see.
  if (it && queues && !queues.some((q) => q.id === it.queue)) {
    return (
      <WiPage title="Not available">
        <p className="text-[17px] text-slate-700">You don&apos;t have access to this project&apos;s work items.</p>
        <Link href={listHref} className="mt-4 inline-block text-violet-700 hover:underline">
          ← Back to Work Items
        </Link>
      </WiPage>
    );
  }

  if (item.error) {
    return (
      <WiPage title="Work item">
        <ErrorBanner error={item.error} />
        <Link href={listHref} className="mt-4 inline-block text-violet-700 hover:underline">
          ← Back to Work Items
        </Link>
      </WiPage>
    );
  }

  return (
    <WiPage
      title={it ? `Item ${it.incrementedDisplayId}` : <Spinner className="h-8 w-8" />}
      subtitle={
        it && (
          <div className="space-y-3">
            <div className="text-sm text-slate-500">
              <Link href={listHref} className="text-violet-700 hover:underline">
                Work Items
              </Link>{" "}
              › {queue?.name ?? it.queue}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="flex items-center gap-1 break-all">
                <span className="text-slate-500">Client ID</span> {it.displayRootsId ?? "—"}
              </span>
              <StatusDot status={it.status} />
              {it.locked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-sm text-amber-800 ring-1 ring-amber-200">
                  <IconLock className="h-3.5 w-3.5" /> Locked by {it.lockingResource}
                </span>
              )}
            </div>
          </div>
        )
      }
      actions={
        it && (
          <>
            <PurpleButton variant="ghost" onClick={() => item.mutate()} title="Refresh">
              <IconRefresh className="h-4 w-4" />
            </PurpleButton>
            {it.locked && (
              <PurpleButton variant="outline" disabled={busy} onClick={() => run(() => wi.put(`/items/${itemId}/unlock?force=true`))}>
                Unlock
              </PurpleButton>
            )}
            {it.status === "system_exception" && (
              <PurpleButton variant="outline" disabled={busy} onClick={() => run(() => wi.post(`/items/${itemId}/force_retry`))}>
                Force retry
              </PurpleButton>
            )}
            <SetStatus current={it.status} locked={it.locked} disabled={busy} onSet={(body) => run(() => wi.put(`/items/${itemId}/status`, body))} />
            <select
              value={it.assigneeId ?? ""}
              disabled={busy}
              onChange={(e) =>
                run(() =>
                  wi.put("/items/assign", {
                    items: [{ work_item_id: it.id, assignee_id: e.target.value || null, assigned_by: me?.id ?? "ui" }],
                  }),
                )
              }
              className="h-[38px] rounded-md border border-slate-300 bg-white px-3 text-sm"
              aria-label="Assigned to"
            >
              <option value="">Unassigned</option>
              {it.assigneeId && !users.some((u) => u.id === it.assigneeId) && (
                <option value={it.assigneeId}>{it.assigneeId}</option>
              )}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <DeleteButton
              disabled={busy}
              onConfirm={() =>
                run(async () => {
                  await wi.del(`/items/${itemId}/delete`);
                  router.push(listHref);
                })
              }
            />
          </>
        )
      }
    >
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {it && (
        <ItemWorkspace itemId={itemId} view={view}>
          {view === "documents" ? (
            <Documents it={it} tenantId={tenantId} defaultConfig={queue?.projectId ?? null} onError={setError} />
          ) : (
            <>
              <V1Details
                it={it}
                users={users}
                busy={busy}
                onAssign={(assigneeId) =>
                  run(() =>
                    wi.put("/items/assign", {
                      items: [{ work_item_id: it.id, assignee_id: assigneeId, assigned_by: me?.id ?? "ui" }],
                    }),
                  )
                }
              />
            </>
          )}
        </ItemWorkspace>
      )}
    </WiPage>
  );
}

function SetStatus({
  current,
  locked,
  disabled,
  onSet,
}: {
  current: string;
  locked: boolean;
  disabled: boolean;
  onSet: (body: Record<string, unknown>) => void;
}) {
  const targets = manualTargets(current, locked);
  const [status, setStatus] = useState(targets[0] ?? "");
  const value = targets.includes(status) ? status : (targets[0] ?? "");
  return (
    <Popover
      width="w-80"
      trigger={(_, toggle) => (
        <PurpleButton
          onClick={toggle}
          disabled={disabled || targets.length === 0}
          title={targets.length ? "" : locked ? "A bot is working on this item" : `No manual change from ${statusLabel(current)}`}
        >
          Set status
        </PurpleButton>
      )}
    >
      {(close) => (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            New status
            <select value={value} onChange={(e) => setStatus(e.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
              {targets.map((s) => (
                <option key={s} value={s}>
                  {MANUAL_LABEL[s] ?? statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-500">
            Bots change status while they hold the lock. Reprocess hands the item back to the bots (queued).
          </p>
          <div className="flex justify-end gap-2">
            <PurpleButton variant="ghost" onClick={close}>
              Cancel
            </PurpleButton>
            <PurpleButton
              disabled={!value}
              onClick={() => {
                onSet({ status: value, manual: true });
                close();
              }}
            >
              Apply
            </PurpleButton>
          </div>
        </div>
      )}
    </Popover>
  );
}

function DeleteButton({ onConfirm, disabled = false }: { onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <PurpleButton variant="danger" disabled={disabled} onClick={() => (armed ? onConfirm() : setArmed(true))} title="Delete item">
      <IconTrash className="h-4 w-4" /> {armed ? "Delete item?" : ""}
    </PurpleButton>
  );
}

// ------------------------------------------------------------------ documents

function Documents({
  it,
  tenantId,
  defaultConfig,
  onError,
}: {
  it: ItemInfo;
  tenantId: string | null;
  defaultConfig: string | null;
  onError: (e: unknown) => void;
}) {
  const { queueId, userName, paths } = useWorkItems();
  // A project has no decision tree (automations choose it in code): an upload here picks one of
  // the tenant's tree configurations, then links the package to this item, as automations do.
  const configs = useSWR<Project[]>(tenantId ? `dt:/v1/customers/${tenantId}/projects` : null, fetcher);
  const [chosen, setChosen] = useState<string>("");
  const usable = (configs.data ?? []).filter((c) => c.tree_id);
  const projectId = chosen || (usable.some((c) => c.id === defaultConfig) ? defaultConfig : usable[0]?.id) || null;
  const docs = useSWR<LinkedPackage[]>(`an:/${it.id}/documents`, fetcher, {
    refreshInterval: (d) => (d?.some((p) => p.status === 1 || p.status === 8) ? 3000 : 20000),
  });
  const filePkgs = useSWR<ItemFile[]>(`wi:/items/${it.id}/file`, fetcher);
  const [linkId, setLinkId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const linked = docs.data ?? [];
  const linkedIds = new Set(linked.map((d) => d.packageId ?? d.package_id));
  // Files a bot attached with a packageId but never linked in the annotations API.
  const unlinked = (filePkgs.data ?? []).filter((f) => f.packageId != null && !linkedIds.has(f.packageId));

  async function link(ids: number[]): Promise<boolean> {
    try {
      await ann.post(`/${it.id}/documents`, { packageIds: Array.from(new Set([...linkedIds, ...ids])) });
      await docs.mutate();
      return true;
    } catch (e) {
      onError(e);
      return false;
    }
  }

  async function unlink(id: number) {
    if (!confirm(`Unlink package #${id} from this work item?`)) return;
    try {
      await ann.post(`/${it.id}/documents`, { packageIds: [...linkedIds].filter((x) => x !== id) });
      await docs.mutate();
    } catch (e) {
      onError(e);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !projectId) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      form.append("project_id", projectId);
      const res = await ann.upload<unknown>(`/${it.id}/upload`, form);
      // Record the documents on the work item too (what bots do after a platform upload).
      const created = (Array.isArray(res) ? res : ((res as { packages?: unknown[] })?.packages ?? [])) as Record<string, unknown>[];
      const files_ = created
        .map((p) => ({ id: Number(p.packageId ?? p.package_id), name: String(p.fileName ?? p.file_name ?? "document.pdf") }))
        .filter((p) => Number.isFinite(p.id));
      if (files_.length) {
        await wi.post(`/items/${it.id}/file`, {
          files: files_.map((p) => ({ fileName: p.name, filePath: String(p.id), packageId: p.id })),
        });
      }
      await Promise.all([docs.mutate(), filePkgs.mutate()]);
    } catch (e) {
      onError(e);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileInput} type="file" multiple accept=".pdf,.zip" className="hidden" onChange={(e) => upload(e.target.files)} />
        {usable.length > 0 && (
          <select
            aria-label="Decision tree"
            value={projectId ?? ""}
            onChange={(e) => setChosen(e.target.value)}
            className="h-[38px] max-w-[260px] rounded-md border border-slate-300 px-3 text-sm"
          >
            {usable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <PurpleButton onClick={() => fileInput.current?.click()} disabled={!projectId || uploading} title={projectId ? "" : "This org has no decision tree yet"}>
          {uploading ? <Spinner className="h-4 w-4" /> : <IconUpload className="h-4 w-4" />} Upload & extract
        </PurpleButton>
        <form
          className="flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = Number(linkId.trim());
            if (!Number.isInteger(n) || n <= 0) {
              onError(new Error("Enter a valid positive integer package ID."));
              return;
            }
            if (await link([n])) setLinkId("");
          }}
        >
          <input value={linkId} onChange={(e) => setLinkId(e.target.value)} placeholder="Package id" className="h-[38px] w-36 rounded-md border border-slate-300 px-3 text-sm" />
          <PurpleButton variant="outline" type="submit">
            <IconLink className="h-4 w-4" /> Link package
          </PurpleButton>
        </form>
        {configs.data && !projectId && (
          <span className="text-sm text-slate-500">To upload here, add a decision tree in the Decision Tree Library.</span>
        )}
      </div>

      <ErrorBanner error={docs.error} />
      <div className="space-y-3">
        {linked.map((d) => {
          const id = d.packageId ?? d.package_id;
          const st = PACKAGE_STATUS[d.status] ?? { label: d.status_name ?? String(d.status), tone: "" };
          const openable = [2, 3, 4, 5, 6, 7].includes(d.status);
          return (
            <div key={id} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-semibold text-slate-900" title={d.fileName ?? d.file_name}>
                  {d.fileName ?? d.file_name}
                </div>
                <div className="mt-0.5 text-sm text-slate-500">
                  ID: {id}
                  {d.page_count ? ` · ${d.page_count} pages` : ""}
                  {d.submitted_by ? ` · submitted by ${userName(d.submitted_by)}` : ""}
                </div>
              </div>
              <div className="min-w-[170px] text-sm">
                <div className="text-slate-500">Status:</div>
                <div className="mt-0.5 flex items-center gap-2 text-[15px] text-slate-900">
                  <span className={cx("h-2.5 w-2.5 rounded-full", DOC_DOT[d.status] ?? "bg-blue-500")} />
                  {st.label}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {d.project_id && d.customer_id && (
                  <Link
                    href={`/customers/${d.customer_id}/projects/${d.project_id}/documents/${id}`}
                    className="inline-flex rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    title="Extraction details (tree path, steps, raw output)"
                  >
                    <IconExternal className="h-4 w-4" />
                  </Link>
                )}
                <button onClick={() => unlink(id)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Unlink from this work item">
                  <IconX className="h-4 w-4" />
                </button>
              </div>
              {(d.documents ?? []).map((doc) => (
                <a
                  key={doc.id}
                  href={`/api/roots-iris/annotation/${id}/documents/${doc.id}/pdf`}
                  download
                  title={`Download the PDF ${doc.file_name} was extracted from`}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                >
                  <IconDownload className="h-4 w-4" /> {(d.documents?.length ?? 0) > 1 ? doc.file_name : "PDF"}
                </a>
              ))}
              {openable ? (
                <Link
                  href={paths ? paths.document(it.id, id) : "/"}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-violet-300 bg-white px-3.5 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50"
                >
                  {d.status === 7 ? "View" : "Open"}
                </Link>
              ) : (
                <PurpleButton variant="outline" disabled>
                  Open
                </PurpleButton>
              )}
            </div>
          );
        })}
        {unlinked.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-4 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-semibold text-slate-900">{f.fileName}</div>
              <div className="mt-0.5 text-sm text-slate-600">
                ID: {f.packageId} · attached as a file, not linked for annotation yet
              </div>
            </div>
            <PurpleButton variant="outline" onClick={() => link([f.packageId as number])}>
              <IconLink className="h-4 w-4" /> Link
            </PurpleButton>
          </div>
        ))}
        {docs.data && linked.length === 0 && unlinked.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-300 px-4 py-10 text-center text-slate-500">
            No documents linked to this work item.
          </div>
        )}
        {!docs.data && !docs.error && <Spinner className="mx-auto h-5 w-5 text-violet-500" />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ data / reporting

/** The work item's details, like v1: status, the item's ids and assignee, then the rows of its
 *  form (label: value) that the automation posts (GET /api/roots-queue/items/{id}/form). */
function V1Details({
  it,
  users,
  busy,
  onAssign,
}: {
  it: ItemInfo;
  users: { id: string; name: string }[];
  busy: boolean;
  onAssign: (assigneeId: string | null) => void;
}) {
  const form = useSWR<{ form: { form_elements: FormElement[] } }>(`wi:/items/${it.id}/form`, fetcher);
  const rows = form.data?.form.form_elements ?? [];
  return (
    <section className="max-w-4xl">
      <div className="flex items-center gap-6">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-slate-300">
          <IconUser className="h-12 w-12 text-white" />
          <span className={cx("absolute bottom-1 right-1 h-4 w-4 rounded-full ring-2 ring-white", STATUS_META[it.status]?.dot ?? "bg-slate-400")} />
        </div>
        <div className="text-[17px]">
          <span className="text-slate-500">Status:</span>
          <span className="ml-8 text-slate-900">{statusLabel(it.status)}</span>
        </div>
      </div>
      <h2 className="mt-12 font-slab text-3xl font-bold text-slate-950">Details</h2>
      <dl className="mt-6 space-y-6 text-[17px]">
        <Row label="Item ID">{it.incrementedDisplayId}</Row>
        <Row label="Trace ID">
          <span className="flex min-w-0 items-start gap-2 break-all font-mono text-[15px]">
            <CopyButton value={it.id} label="Copy trace id" />
            {it.id}
          </span>
        </Row>
        <Row label="Client ID">
          <span className="break-all">{it.displayRootsId ?? "—"}</span>
        </Row>
        <Row label="Assigned To">
          <label className="flex h-12 w-full max-w-xs items-center gap-3 rounded-md border border-slate-300 px-3">
            <IconUser className="h-6 w-6 shrink-0 rounded-full bg-slate-100 p-0.5 text-slate-400" />
            <select
              value={it.assigneeId ?? ""}
              disabled={busy}
              onChange={(e) => onAssign(e.target.value || null)}
              className="h-full w-full bg-transparent text-[16px] focus:outline-none"
              aria-label="Assigned to"
            >
              <option value="">Unassigned</option>
              {it.assigneeId && !users.some((u) => u.id === it.assigneeId) && (
                <option value={it.assigneeId}>{it.assigneeId}</option>
              )}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </Row>
        {it.exceptionReason && (
          <Row label={it.lastExceptionType === "System_Exception" ? "System Exception" : "Exception"}>
            <span className="break-words text-red-800">{it.exceptionReason}</span>
          </Row>
        )}
      </dl>
      <hr className="my-10 border-slate-200" />
      {form.error && <ErrorBanner error={form.error} />}
      {!form.data && !form.error && <Spinner className="h-5 w-5 text-slate-400" />}
      <dl className="space-y-7 text-[17px]">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] gap-6 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <dt className="break-words font-serif font-bold text-slate-900">{r.label}:</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-slate-800">
              {r.value === null || r.value === undefined || r.value === ""
                ? "—"
                : typeof r.value === "object"
                  ? JSON.stringify(r.value)
                  : String(r.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface FormElement {
  id: string;
  label: string;
  value: unknown;
  type: string;
  permission: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
      <dt className="font-semibold text-slate-950">{label}:</dt>
      <dd className="min-w-0 text-slate-900">{children}</dd>
    </div>
  );
}
