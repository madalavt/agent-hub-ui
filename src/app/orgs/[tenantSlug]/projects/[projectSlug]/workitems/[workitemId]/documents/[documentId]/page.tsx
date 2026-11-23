"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { IconAlert, IconDownload, IconPlus, IconTrash, IconUser } from "@/components/icons";
import { ErrorBanner, Modal, Spinner, cx } from "@/components/ui";
import { CopyButton, PurpleButton } from "@/components/workitems/bits";
import { ItemWorkspace } from "@/components/workitems/ItemWorkspace";
import { WiPage, useWorkItems } from "@/components/workitems/WorkItemsShell";
import { ann, fetcher, pageImageUrl, wi } from "@/lib/api";
import {
  type AnnDetails,
  type AnnField,
  type AnnSubDocument,
  type AnnTable,
  type AnnTableData,
  type Cell,
  type DisplayTemplate,
  type ItemInfo,
  MANUAL_LABEL,
  PACKAGE_STATUS,
  type PageImage,
  STATUS_META,
  display,
  fmtDate,
  manualTargets,
  statusLabel,
} from "@/lib/workItems";

interface Edit {
  /** Only set when the user actually changed the value (comment-only edits keep the typed f.value). */
  value?: string;
  comment?: string;
}

export default function AnnotatePage() {
  // /orgs/{tenant}/projects/{project}/workitems/{traceId}/documents/{packageId} (like v1)
  const { documentId: packageId, workitemId } = useParams<{ documentId: string; workitemId: string }>();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { me, userName, users, queues, paths } = useWorkItems();
  const details = useSWR<AnnDetails>(`an:/${packageId}/details`, fetcher);
  const d = details.data;
  const itemId = d?.work_item_id ?? workitemId;
  const documentsHref = paths && itemId ? paths.item(String(itemId), "documents") : (paths?.workitems ?? "/");
  const item = useSWR<ItemInfo>(itemId ? `wi:/items/${itemId}` : null, fetcher);

  const [docIdx, setDocIdx] = useState(0);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [focusPage, setFocusPage] = useState<{ page: number; seq: number } | null>(null);

  const doc: AnnSubDocument | undefined = d?.sub_documents[docIdx];
  const readOnly = !!d?.read_only_mode;
  const dirty = Object.keys(edits).length;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // v1's save body: every field of each edited document in the editor's format (Name / Value /
  // uuid = ml_field_id / editDetails ...), with unsaved_fields, extraction_end_name and
  // leaf_node_id. Table fields are saved through their own table edits.
  function saveBody() {
    const editDetails = {
      modified_by: me ? { email: me.email ?? null, name: me.name } : null,
      modified_on: new Date().toISOString(),
    };
    return {
      sub_documents: (d?.sub_documents ?? [])
        .filter((sd) => sd.modified_data.some((f) => edits[f.id]))
        .map((sd) => {
          const fields = sd.modified_data.filter((f) => f.field_type !== "table");
          return {
            id: sd.id,
            modified_data: fields.map((f) => {
              const e = edits[f.id];
              return {
                Name: f.name,
                Value: e && e.value !== undefined ? e.value : f.value,
                customer_key: f.customer_key,
                field_type: f.field_type,
                is_grid_field: f.is_grid_field,
                file_name: null,
                mlConfidenceScore: 0,
                "SubImage X1": null,
                "SubImage X3": null,
                "SubImage Y1": null,
                "SubImage Y3": null,
                page_number: f.page_number ?? null,
                uuid: f.ml_field_id,
                Comment: e && e.comment !== undefined ? e.comment || null : f.comment,
                Error: null,
                id: null,
                ml_field_id: f.ml_field_id,
                ...(e ? { editDetails } : {}),
              };
            }),
            unsaved_fields: fields.map((f) => ({ name: `${sd.id}__${f.name}` })),
            extraction_end_name: sd.extraction_end_name,
            leaf_node_id: sd.leaf_node_id ?? null,
          };
        }),
      is_save_only: 1,
    };
  }

  async function save(isSaveOnly: boolean, thenStatus?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Like v1: SAVE posts the edited documents with is_save_only 1; SUBMIT posts only
      // {is_save_only: 0} (pending edits are saved first). The screen then reloads the details.
      if (dirty) {
        await ann.post(`/${packageId}/submit`, saveBody());
        setEdits({});
        await details.mutate();
      }
      if (!isSaveOnly) {
        await ann.post(`/${packageId}/submit`, { is_save_only: 0 });
        await details.mutate();
      }
      if (thenStatus && itemId) {
        await wi.put(`/items/${itemId}/status`, { status: thenStatus, manual: true });
        await wi.put(`/items/${itemId}/notes`, { notes: `Annotation of package ${packageId} submitted${me ? ` by ${me.name}` : ""}.` });
        await item.mutate();
      }
      setNotice(isSaveOnly ? "Edits saved." : "Annotation submitted.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  // Work item actions from the summary's action bar.
  async function reprocess() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // A system exception is retried as a new Item ID (same trace id); a reviewed item goes
      // back to the bots.
      if (item.data?.status === "system_exception") await wi.post(`/items/${itemId}/force_retry`);
      else await wi.put(`/items/${itemId}/status`, { status: "queued", manual: true });
      await item.mutate();
      setNotice("Work item queued for reprocessing.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function closeManually() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await wi.put(`/items/${itemId}/status`, { status: "manually_closed", manual: true });
      await item.mutate();
      setNotice("Work item closed manually.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!confirm("Discard all saved field and table edits for this package? This restores the original extracted values.")) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await ann.post(`/${packageId}/cleanup`);
      setEdits({});
      await details.mutate();
      await mutateGlobal((key) => typeof key === "string" && key.startsWith("an:/table/"));
      setNotice("All saved edits discarded.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  // Only documents of work items in projects (queues) the user may see.
  if (item.data && queues && !queues.some((q) => q.id === item.data?.queue)) {
    return (
      <WiPage title="Not available">
        <p className="text-[17px] text-slate-700">You don&apos;t have access to this project&apos;s work items.</p>
        <Link href={paths?.workitems ?? "/"} className="mt-4 inline-block text-violet-700 hover:underline">
          ← Back to Work Items
        </Link>
      </WiPage>
    );
  }

  const targets = manualTargets(item.data?.status, item.data?.locked);
  const st = d ? (PACKAGE_STATUS[d.package_status] ?? { label: d.status_name ?? String(d.package_status), tone: "bg-slate-100" }) : null;

  return (
    <WiPage
      wide
      title={d ? d.file_name || d.package_name : <Spinner className="h-8 w-8" />}
      subtitle={
        d && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
            <span className="font-mono text-slate-600">Package #{d.package_id}</span>
            {d.project_name && <span>{d.project_name}</span>}
            {st && <span className={cx("rounded-full px-2.5 py-0.5 text-sm font-medium", st.tone)}>{st.label}</span>}
            {d.confident === false && !readOnly && (
              <span className="text-sm text-red-700">Some values are below their confidence threshold: review the highlighted ones.</span>
            )}
            <span className="capitalize text-slate-600">Review: {d.annotation_status.replace("_", " ")}</span>
            {d.submitted_by && (
              <span className="text-slate-600">
                Submitted by {userName(d.submitted_by)} · {fmtDate(d.submitted_at)}
              </span>
            )}
            {itemId && (
              <Link href={documentsHref} className="text-violet-700 hover:underline">
                Work item {item.data ? `${item.data.incrementedDisplayId} · ${statusLabel(item.data.status)}` : ""} →
              </Link>
            )}
          </div>
        )
      }
      actions={
        d && (
          <>
            {doc && (
              <a
                href={`/api/roots-iris/annotation/${packageId}/documents/${doc.id}/pdf`}
                download
                title={`The PDF ${doc.file_name} was extracted from`}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-violet-300 bg-white px-3.5 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50"
              >
                <IconDownload className="h-4 w-4" /> Download PDF
              </a>
            )}
            <a
              href={`/api/roots-iris/annotation/${packageId}/file`}
              target="_blank"
              rel="noreferrer"
              title="The file as uploaded (PDF or ZIP)"
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Original upload
            </a>
            {!readOnly && (
              <PurpleButton variant="danger" disabled={busy} onClick={discard} title="Discard every saved edit for this package">
                Discard edits
              </PurpleButton>
            )}
            {d.sub_documents.length > 0 && (
              <>
                {!readOnly && dirty > 0 && (
                  <PurpleButton variant="outline" className="uppercase" disabled={busy} onClick={() => setEdits({})} title="Drop edits that are not saved yet">
                    Cancel
                  </PurpleButton>
                )}
                <PurpleButton variant="outline" className="uppercase" disabled={busy || readOnly || !dirty} onClick={() => save(true)}>
                  Save{dirty ? ` (${dirty})` : ""}
                </PurpleButton>
                <PurpleButton
                  className="uppercase"
                  disabled={busy || readOnly || !d.package_next_status}
                  onClick={() => setSubmitOpen(true)}
                  title={readOnly ? "Read only" : `Moves the package to ${d.package_next_status}`}
                >
                  Submit
                </PurpleButton>
              </>
            )}
          </>
        )
      }
    >
      <ItemWorkspace itemId={String(itemId ?? "")} view="document">
      <ErrorBanner error={details.error || error} onDismiss={() => setError(null)} />
      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs text-emerald-700 hover:underline">
            dismiss
          </button>
        </div>
      )}
      {d && readOnly && d.sub_documents.length > 0 && (
        <div className="mb-4 rounded-md bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 ring-1 ring-green-200">
          On Read Only Mode{d.package_status === 7 ? " · Completed" : ""}
        </div>
      )}
      {d && d.sub_documents.length === 0 && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">
          {d.package_status === 99 ? `Extraction failed: ${d.error ?? "unknown error"}` : "Extraction hasn't finished yet; nothing to annotate."}
        </div>
      )}
      {d && doc && (
        <>
          {d.sub_documents.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {d.sub_documents.map((sd, i) => (
                <button
                  key={sd.id}
                  onClick={() => {
                    setDocIdx(i);
                    setFocusPage(null);
                  }}
                  className={cx("rounded-full px-3 py-1 text-sm", i === docIdx ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
                >
                  {sd.file_name} {sd.document_type ? `· ${sd.document_type}` : ""}
                </button>
              ))}
            </div>
          )}
          <section className="mb-8">
            <div className="flex items-center gap-5">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-slate-200">
                <IconUser className="h-12 w-12 text-slate-400" />
                <span className={cx("absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full ring-2 ring-white", STATUS_META[item.data?.status ?? ""]?.dot ?? "bg-slate-300")} />
              </div>
              <div className="text-[17px] text-slate-500">
                Status: <span className="ml-6 text-slate-900">{item.data ? statusLabel(item.data.status) : "—"}</span>
              </div>
            </div>
            <h2 className="mt-10 font-serif text-3xl font-semibold text-slate-950">Details</h2>
            <dl className="mt-5 space-y-5 text-[17px]">
              <DetailRow label="Item ID">{item.data ? String(item.data.incrementedDisplayId) : "—"}</DetailRow>
              <DetailRow label="Trace ID">
                <span className="flex min-w-0 items-center gap-2 break-all font-mono text-[15px]">
                  {itemId ? String(itemId) : "—"}
                  {itemId && <CopyButton value={String(itemId)} label="Copy trace id" />}
                </span>
              </DetailRow>
              <DetailRow label="Client ID">{item.data?.displayRootsId ?? "—"}</DetailRow>
              <DetailRow label="File">{d.file_name || d.package_name}</DetailRow>
              <DetailRow label="Assigned to">
                {itemId ? (
                  <select
                    value={item.data?.assigneeId ?? ""}
                    disabled={busy || !item.data}
                    onChange={(e) =>
                      wi
                        .put("/items/assign", {
                          items: [{ work_item_id: String(itemId), assignee_id: e.target.value || null, assigned_by: me?.id ?? "ui" }],
                        })
                        .then(() => item.mutate())
                        .catch(setError)
                    }
                    className="h-[38px] w-full max-w-full rounded-md sm:w-auto sm:min-w-[220px] border border-slate-300 bg-white px-3 text-[15px]"
                    aria-label="Assigned to"
                  >
                    <option value="">Unassigned</option>
                    {item.data?.assigneeId && !(users ?? []).some((u) => u.id === item.data?.assigneeId) && (
                      <option value={item.data.assigneeId}>{userName(item.data.assigneeId)}</option>
                    )}
                    {(users ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  "Unassigned"
                )}
              </DetailRow>
            </dl>
            <dl className="mt-8 space-y-5 border-t border-slate-200 pt-8 text-[17px]">
              <DetailRow label="Document type">{doc.document_type ?? "—"}</DetailRow>
              <TemplateRows doc={doc} />
              {item.data?.lastExceptionType && <DetailRow label="Exception type">{item.data.lastExceptionType.replace("_", " ")}</DetailRow>}
              {item.data?.exceptionReason && <DetailRow label="Exception message">{item.data.exceptionReason}</DetailRow>}
            </dl>
          </section>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <PageViewer packageId={d.package_id} doc={doc} focusPage={focusPage} />
            <FieldsPane
              key={doc.id}
              doc={doc}
              readOnly={readOnly}
              edits={edits}
              setEdits={setEdits}
              onFocusPage={(page) => setFocusPage((prev) => ({ page, seq: (prev?.seq ?? 0) + 1 }))}
              onTableChanged={() => void details.mutate()}
              onError={setError}
            />
          </div>
          <div className="sticky bottom-0 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 py-4 backdrop-blur">
            <Link href={documentsHref} className="text-[15px] font-medium text-violet-700 hover:underline">
              ← Back to documents
            </Link>
            {!readOnly && (
              <div className="flex flex-wrap justify-end gap-3">
                {itemId && (item.data?.status === "system_exception" || targets.includes("queued")) && (
                  <PurpleButton className="uppercase" disabled={busy} onClick={reprocess}>
                    Reprocess
                  </PurpleButton>
                )}
                {itemId && targets.includes("manually_closed") && (
                  <PurpleButton className="uppercase" disabled={busy} onClick={closeManually}>
                    Close manually
                  </PurpleButton>
                )}
              </div>
            )}
          </div>
        </>
      )}
      <SubmitDialog
        open={submitOpen}
        nextStatus={d?.package_next_status ?? null}
        itemStatus={item.data?.status}
        targets={targets}
        hasItem={!!itemId}
        dirty={dirty}
        onClose={() => setSubmitOpen(false)}
        onSubmit={(status) => {
          setSubmitOpen(false);
          // The work item's status changes only when the package is completed.
          save(false, d?.package_next_status_id === 7 ? status || undefined : undefined);
        }}
      />
      </ItemWorkspace>
    </WiPage>
  );
}

/** The document's fields in the order and with the titles of its decision-tree node's display
 *  template (v1: /api/roots-igpt/node/{leaf}/display-template). Tables are shown below. */
function TemplateRows({ doc }: { doc: AnnSubDocument }) {
  const leaf = doc.leaf_node_id;
  const tpl = useSWR<DisplayTemplate>(leaf ? `ig:/node/${leaf}/display-template` : null, fetcher);
  const props = Object.values(tpl.data?.node.display_template.template.properties ?? {})
    .filter((p) => p.display_type !== "Table" && p.customer_key !== "document_type")
    .sort((a, b) => a.order - b.order);
  if (!props.length) return null;
  const byKey = new Map(doc.modified_data.map((f) => [f.customer_key, f]));
  return (
    <>
      {props.map((p) => {
        const f = byKey.get(p.customer_key);
        const v = f?.value;
        return (
          <DetailRow key={p.customer_key} label={p.title}>
            {v === null || v === undefined || v === "" ? <span className="text-slate-400">—</span> : display(v)}
          </DetailRow>
        );
      })}
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
      <dt className="font-serif font-semibold text-slate-900 [overflow-wrap:anywhere]">{label}:</dt>
      <dd className="min-w-0 break-words text-slate-900">{children}</dd>
    </div>
  );
}

function PageViewer({
  packageId,
  doc,
  focusPage,
}: {
  packageId: number;
  doc: AnnSubDocument;
  focusPage: { page: number; seq: number } | null;
}) {
  // v1: page id -> image URL, in page order.
  const images = useSWR<Record<string, string>>(`an:/${packageId}/docImages/${doc.id}`, fetcher);
  const pages = {
    ...images,
    data: images.data
      ? Object.keys(images.data).map((id, i): PageImage => ({ page_id: Number(id), page_number: i + 1 }))
      : undefined,
  };
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    if (focusPage == null) return;
    document.getElementById(`page-${doc.id}-${focusPage.page}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusPage, doc.id]);
  return (
    <section className="flex h-[calc(100vh-180px)] min-h-[520px] flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 text-sm">
        <span className="text-slate-700">
          {doc.file_name} · {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1">
          <button className="rounded px-2 py-0.5 hover:bg-slate-100" onClick={() => setZoom((z) => Math.max(50, z - 25))}>
            −
          </button>
          <span className="w-12 text-center text-xs text-slate-600">{zoom}%</span>
          <button className="rounded px-2 py-0.5 hover:bg-slate-100" onClick={() => setZoom((z) => Math.min(250, z + 25))}>
            +
          </button>
        </span>
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-4 scrollbar-thin">
        {pages.error && <ErrorBanner error={pages.error} />}
        {!pages.data && !pages.error && <Spinner className="mx-auto mt-10 h-6 w-6 text-violet-500" />}
        {pages.data?.map((p) => (
          <figure key={p.page_id} id={`page-${doc.id}-${p.page_number}`} className="mx-auto" style={{ width: `${zoom}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pageImageUrl(packageId, doc.id, p.page_id, zoom > 150 ? 160 : 110)}
              alt={`Page ${p.page_number}`}
              loading="lazy"
              className="w-full bg-white shadow ring-1 ring-slate-200"
            />
            <figcaption className="mt-1 text-center text-xs text-slate-500">Page {p.page_number}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function FieldsPane({
  doc,
  readOnly,
  edits,
  setEdits,
  onFocusPage,
  onTableChanged,
  onError,
}: {
  doc: AnnSubDocument;
  readOnly: boolean;
  edits: Record<number, Edit>;
  setEdits: React.Dispatch<React.SetStateAction<Record<number, Edit>>>;
  onFocusPage: (p: number) => void;
  onTableChanged: () => void;
  onError: (e: unknown) => void;
}) {
  const fields = doc.modified_data.filter((f) => f.field_type !== "table");
  const extracted = new Map(doc.extracted_data.map((f) => [f.id, f.value]));
  const [tab, setTab] = useState<"fields" | number>("fields");
  const [filter, setFilter] = useState("");
  const shown = fields.filter((f) => !filter || `${f.name} ${display(f.value)}`.toLowerCase().includes(filter.toLowerCase()));
  const table = typeof tab === "number" ? doc.tables.find((t) => t.id === tab) : undefined;

  return (
    <section className="flex h-[calc(100vh-180px)] min-h-[520px] flex-col overflow-hidden rounded-md border border-slate-200">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 scrollbar-thin">
        <TabBtn active={tab === "fields"} onClick={() => setTab("fields")}>
          Fields ({fields.length})
        </TabBtn>
        {doc.tables.map((t) => (
          <TabBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.name} ({t.row_count})
          </TabBtn>
        ))}
      </div>
      {tab === "fields" ? (
        <div className="flex-1 overflow-auto scrollbar-thin">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter fields…" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <ul className="divide-y divide-slate-100">
            {shown.map((f) => (
              <FieldRow
                key={f.id}
                f={f}
                original={extracted.get(f.id)}
                readOnly={readOnly}
                edit={edits[f.id]}
                onChange={(e) =>
                  setEdits((prev) => {
                    const next = { ...prev };
                    if (e === null) delete next[f.id];
                    else next[f.id] = e;
                    return next;
                  })
                }
                onFocusPage={onFocusPage}
              />
            ))}
            {shown.length === 0 && <li className="px-4 py-10 text-center text-slate-500">No fields.</li>}
          </ul>
        </div>
      ) : (
        table && <TableEditor key={table.id} table={table} readOnly={readOnly} onTableChanged={onTableChanged} onError={onError} />
      )}
    </section>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "whitespace-nowrap border-b-[3px] px-3 py-3 text-sm font-semibold",
        active ? "border-violet-600 text-slate-950" : "border-transparent text-slate-600 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}

function FieldRow({
  f,
  original,
  readOnly,
  edit,
  onChange,
  onFocusPage,
}: {
  f: AnnField;
  /** The value as extracted (v1 extracted_data). */
  original: unknown;
  readOnly: boolean;
  edit?: Edit;
  onChange: (e: Edit | null) => void;
  onFocusPage: (p: number) => void;
}) {
  const current = display(f.value);
  const currentComment = f.comment ?? "";
  const value = edit?.value ?? current;
  const commentValue = edit?.comment ?? currentComment;
  const [showComment, setShowComment] = useState(!!f.comment);
  const conf = f.ml_confidence_score;
  const low = typeof conf === "number" && conf > 0 && conf < 0.8;
  const setValue = (v: string) => {
    const valueChanged = v !== current;
    const commentChanged = commentValue !== currentComment;
    if (!valueChanged && !commentChanged) onChange(null);
    else onChange({ ...(valueChanged ? { value: v } : {}), ...(commentChanged ? { comment: commentValue } : {}) });
  };
  const setComment = (c: string) => {
    const valueChanged = edit?.value !== undefined && edit.value !== current;
    const commentChanged = c !== currentComment;
    if (!valueChanged && !commentChanged) onChange(null);
    else onChange({ ...(valueChanged ? { value: edit.value } : {}), ...(commentChanged ? { comment: c } : {}) });
  };
  return (
    <li className={cx("px-4 py-3", edit && "bg-violet-50/50")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
          <span className="truncate" title={f.customer_key}>
            {f.name}
          </span>
          {(f.is_modified || edit) && <span className="rounded bg-violet-100 px-1.5 text-[10px] font-semibold uppercase text-violet-700">edited</span>}
          {f.error && (
            <span title={f.error}>
              <IconAlert className="h-4 w-4 text-red-500" />
            </span>
          )}
        </label>
        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {f.page_number != null && (
            <button className="text-violet-700 hover:underline" onClick={() => onFocusPage(f.page_number as number)}>
              p.{f.page_number}
            </button>
          )}
          {typeof conf === "number" && conf > 0 && (
            <span className={cx("rounded px-1.5 py-0.5", low ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>{Math.round(conf * 100)}%</span>
          )}
          {!readOnly && (
            <button className="hover:text-slate-800" onClick={() => setShowComment((s) => !s)}>
              {showComment ? "Hide comment" : "Comment"}
            </button>
          )}
        </span>
      </div>
      <textarea
        value={value}
        readOnly={readOnly}
        rows={value.length > 80 || value.includes("\n") ? Math.min(8, Math.max(2, Math.ceil(value.length / 80))) : 1}
        onChange={(e) => setValue(e.target.value)}
        className="block w-full resize-none rounded-md border border-slate-300 px-3 py-1.5 text-sm read-only:bg-slate-50 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 [field-sizing:content]"
      />
      {f.is_modified && original !== undefined && (
        <div className="mt-1 text-xs text-slate-500">
          Extracted: <span className="font-mono">{display(original) || "∅"}</span>
          {f.last_modified_on && ` · edited ${fmtDate(f.last_modified_on)}`}
        </div>
      )}
      {showComment && (
        <input
          value={commentValue}
          readOnly={readOnly}
          placeholder="Reviewer comment"
          onChange={(e) => setComment(e.target.value)}
          className="mt-2 block w-full rounded-md border border-dashed border-slate-300 px-3 py-1 text-xs"
        />
      )}
    </li>
  );
}

function TableCellInput({
  value,
  readOnly,
  title,
  className,
  onCommit,
}: {
  value: string;
  readOnly: boolean;
  title: string;
  className: string;
  onCommit: (next: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <input
      value={text}
      readOnly={readOnly}
      title={title}
      onChange={(e) => setText(e.target.value)}
      onBlur={async () => {
        if (readOnly || text === value) return;
        const ok = await onCommit(text);
        if (!ok) setText(value);
      }}
      className={className}
    />
  );
}

function TableEditor({
  table,
  readOnly,
  onTableChanged,
  onError,
}: {
  table: AnnTable;
  readOnly: boolean;
  onTableChanged: () => void;
  onError: (e: unknown) => void;
}) {
  const data = useSWR<AnnTableData>(`an:/table/${table.id}?startRow=0&endRow=1000&fullCellDetails=true&addColumns=true`, fetcher);
  const [opBusy, setOpBusy] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const columns = useMemo(() => {
    const cols = data.data?.columns?.length ? data.data.columns : table.columns;
    if (cols?.length) return cols;
    const first = data.data?.rows[0];
    return first ? Object.keys(first).filter((k) => !["id", "row_index", "source_pages"].includes(k)).map((key) => ({ key, name: key })) : [];
  }, [data.data, table.columns]);
  const ro = readOnly || !!data.data?.metadata.readOnly;

  async function op(ops: unknown[], rowCountChanged = false): Promise<boolean> {
    setOpBusy(true);
    setSavedNotice(null);
    try {
      await ann.put(`/table/${table.id}`, ops);
      await data.mutate();
      if (rowCountChanged) onTableChanged();
      setSavedNotice("Saved");
      setTimeout(() => setSavedNotice(null), 2000);
      return true;
    } catch (e) {
      onError(e);
      return false;
    } finally {
      setOpBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      {data.error && (
        <div className="p-4">
          <ErrorBanner error={data.error} />
        </div>
      )}
      {!data.data && !data.error && <Spinner className="mx-auto mt-10 h-6 w-6 text-violet-500" />}
      {data.data && data.data.metadata.totalRowCount > data.data.rows.length && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          Showing first {data.data.rows.length} of {data.data.metadata.totalRowCount} rows.
        </div>
      )}
      {data.data && (
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-left">
            <tr>
              <th className="w-10 px-2 py-2 text-xs font-medium text-slate-500">#</th>
              {columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap border-l border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700" title={c.key}>
                  {c.name ?? c.key}
                </th>
              ))}
              {!ro && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {data.data.rows.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-violet-50/30">
                <td className="px-2 text-xs text-slate-400">{i + 1}</td>
                {columns.map((c) => {
                  const cell = r[c.key] as Cell | unknown;
                  const v: Cell = cell && typeof cell === "object" && "value" in (cell as object) ? (cell as Cell) : { value: cell };
                  const lowScore = typeof v.score === "number" && v.score < 0.8;
                  return (
                    <td key={c.key} className="border-l border-slate-100 p-0">
                      <TableCellInput
                        value={display(v.value)}
                        readOnly={ro}
                        title={[
                          v.error,
                          v.original_value !== undefined ? `extracted: ${display(v.original_value)}` : "",
                          typeof v.score === "number" ? `confidence ${Math.round(v.score * 100)}%` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        onCommit={(nextVal) => op([{ update: { id: r.id, [c.key]: nextVal } }])}
                        className={cx(
                          "w-full min-w-[110px] bg-transparent px-2 py-1.5 focus:bg-white focus:outline focus:outline-2 focus:outline-violet-400",
                          v.error && "bg-red-50",
                          lowScore && !v.error && "bg-amber-100",
                          v.original_value !== undefined && "bg-violet-50",
                        )}
                      />
                    </td>
                  );
                })}
                {!ro && (
                  <td className="px-1">
                    <button
                      disabled={opBusy}
                      onClick={() => confirm(`Delete row #${i + 1}?`) && op([{ delete: { id: r.id } }], true)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      title="Delete row"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.data && !ro && (
        <div className="flex items-center gap-3 p-3">
          <PurpleButton
            variant="outline"
            disabled={opBusy}
            onClick={() => op([{ add: Object.fromEntries(columns.map((c) => [c.key, ""])), addIndex: data.data?.rows.length ?? 0 }], true)}
          >
            <IconPlus className="h-4 w-4" /> Add row
          </PurpleButton>
          <span className="text-xs text-slate-500">
            {savedNotice ? <span className="font-medium text-emerald-700">{savedNotice}</span> : "Cell edits save when you leave the cell."}
          </span>
        </div>
      )}
    </div>
  );
}

function SubmitDialog({
  open,
  itemStatus,
  targets,
  hasItem,
  dirty,
  onClose,
  onSubmit,
  nextStatus,
}: {
  open: boolean;
  nextStatus: string | null;
  itemStatus?: string;
  targets: string[];
  hasItem: boolean;
  dirty: number;
  onClose: () => void;
  onSubmit: (itemStatus: string) => void;
}) {
  const [status, setStatus] = useState("queued");
  const value = targets.includes(status) ? status : "";
  return (
    <Modal open={open} onClose={onClose} title="Submit annotation">
      {nextStatus === "Completed" ? (
        <p className="text-sm text-slate-700">
          Submitting saves {dirty ? `${dirty} pending edit${dirty === 1 ? "" : "s"} and ` : ""}marks the package <b>Completed</b> (read only). Projects
          polling the Annotations API pick up the corrected values.
        </p>
      ) : (
        <p className="text-sm text-slate-700">
          Submitting saves {dirty ? `${dirty} pending edit${dirty === 1 ? "" : "s"} and ` : ""}moves the package to <b>{nextStatus}</b>. Submit
          again from {nextStatus} to complete it.
        </p>
      )}
      {hasItem && nextStatus === "Completed" && (
        <label className="block text-sm text-slate-700">
          Then set the work item ({itemStatus ? statusLabel(itemStatus) : "…"}) to
          <select value={value} onChange={(e) => setStatus(e.target.value)} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5">
            {targets.map((s) => (
              <option key={s} value={s}>
                {MANUAL_LABEL[s] ?? statusLabel(s)}
              </option>
            ))}
            <option value="">No change</option>
          </select>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <PurpleButton variant="ghost" onClick={onClose}>
          Cancel
        </PurpleButton>
        <PurpleButton onClick={() => onSubmit(hasItem ? value : "")}>Submit</PurpleButton>
      </div>
    </Modal>
  );
}
