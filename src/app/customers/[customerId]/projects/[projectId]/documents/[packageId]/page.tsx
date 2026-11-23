"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { projectPaths } from "@/lib/paths";
import { useState } from "react";
import useSWR from "swr";
import { DataTable } from "@/components/DataTable";
import { IconAlert, IconCheck, IconDownload, IconRefresh, IconTree } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge, Button, Card, ErrorBanner, PageHeader, Spinner, cx } from "@/components/ui";
import { ann, fetcher, fileUrl } from "@/lib/api";
import { formatDateTime, formatDuration, formatValue } from "@/lib/format";
import type { Customer, DocumentResult, ExtractedField, PackageResults, Project, Step, TenantProject } from "@/lib/types";
import type { ItemInfo } from "@/lib/workItems";

export default function PackagePage() {
  const { customerId, projectId, packageId } = useParams<{ customerId: string; projectId: string; packageId: string }>();
  // The work item the package belongs to (its summary screen lives under the work item).
  const link = useSWR<{ work_item_id: string | null }>(`an:/${packageId}/data`, fetcher);
  const workItemId = link.data?.work_item_id ?? null;
  const workItem = useSWR<ItemInfo>(workItemId ? `wi:/items/${workItemId}` : null, fetcher);
  const tenantProjects = useSWR<TenantProject[]>(workItemId ? `ra:/tenant/${customerId}/projects` : null, fetcher);
  const customer = useSWR<Customer>(`dt:/v1/customers/${customerId}`, fetcher);
  const project = useSWR<Project>(`dt:/v1/projects/${projectId}`, fetcher);
  const [showRaw, setShowRaw] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const results = useSWR<PackageResults>(`ex:/v1/packages/${packageId}/results${showRaw ? "?include_raw=true" : ""}`, fetcher, {
    refreshInterval: (d) => (d?.display_status === "processing" ? 2500 : 0),
  });
  const steps = useSWR<Step[]>(`ex:/v1/packages/${packageId}/steps`, fetcher, {
    refreshInterval: () => (results.data?.display_status === "processing" ? 2500 : 0),
  });
  const [docIndex, setDocIndex] = useState(0);
  const [tab, setTab] = useState<"results" | "steps" | "text" | "pdf">("results");

  const pkg = results.data;
  const doc = pkg?.results[docIndex];
  const annotateProjectId =
    tenantProjects.data?.find((tp) => workItem.data?.queue && tp.queue_id === workItem.data.queue)?.project_id ??
    tenantProjects.data?.find((tp) => tp.project_id === projectId)?.project_id ??
    tenantProjects.data?.[0]?.project_id ??
    null;

  return (
    <div className="mx-auto max-w-[1400px] p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Customers", href: "/" },
          { label: customer.data?.name ?? "…", href: `/customers/${customerId}` },
          { label: project.data?.name ?? "…", href: `/customers/${customerId}/projects/${projectId}` },
          { label: pkg?.file_name ?? "…" },
        ]}
        title={
          <span className="flex items-center gap-3">
            {pkg?.file_name ?? "Loading…"} {pkg && <StatusBadge status={pkg.display_status} />}
          </span>
        }
        subtitle={
          pkg && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Package #{pkg.package_id}</span>
              <span>Uploaded {formatDateTime(pkg.created_at)}</span>
              {pkg.timings?.total !== undefined && <span>Took {formatDuration(pkg.timings.total)}</span>}
              {pkg.tree_id && (
                <Link href={`/trees/${pkg.tree_id}`}>
                  <Badge tone="indigo">
                    <IconTree className="h-3 w-3" /> {pkg.tree_name} v{pkg.tree_version}
                  </Badge>
                </Link>
              )}
            </span>
          )
        }
        actions={
          pkg && (
            <>
              <a
                href={fileUrl(pkg.package_id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
              >
                <IconDownload /> Original
              </a>
              {pkg.display_status === "completed" && workItemId && annotateProjectId && (
                <Link
                  href={projectPaths(customerId, annotateProjectId).document(workItemId, pkg.package_id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
                >
                  Annotate
                </Link>
              )}
              {pkg.display_status !== "processing" && (
                <Button
                  variant="secondary"
                  loading={reprocessing}
                  onClick={async () => {
                    setReprocessing(true);
                    setActionError(null);
                    try {
                      await ann.post(`/${pkg.package_id}/reprocess`);
                      await Promise.all([results.mutate(), steps.mutate(), link.mutate()]);
                    } catch (e) {
                      setActionError(e);
                    } finally {
                      setReprocessing(false);
                    }
                  }}
                >
                  <IconRefresh /> Reprocess
                </Button>
              )}
            </>
          )
        }
      />
      <ErrorBanner error={results.error || actionError} onDismiss={() => setActionError(null)} />

      {pkg?.display_status === "processing" && (
        <Card className="mb-6 p-6">
          <div className="flex items-center gap-3">
            <Spinner className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-slate-900">{pkg.status === "UPLOADED" ? "Queued for extraction" : "Extraction in progress"}</p>
              <p className="text-sm text-slate-500">This page updates automatically when the decision tree finishes.</p>
            </div>
          </div>
          <StepsList steps={steps.data ?? []} className="mt-4" />
        </Card>
      )}

      {pkg?.display_status === "failed" && (
        <div className="mb-6">
          <ErrorBanner error={{ message: "Extraction failed", details: [pkg.error ?? "unknown error"] }} />
        </div>
      )}

      {pkg && pkg.display_status !== "processing" && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
            <div className="flex gap-1">
              {(
                [
                  ["results", "Extraction"],
                  ["steps", `Processing steps${steps.data ? ` (${steps.data.length})` : ""}`],
                  ["text", "Page text"],
                  ["pdf", "Original file"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cx(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                    tab === k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "results" && (
              <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
                <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} className="rounded border-slate-300" />
                Show raw model output
              </label>
            )}
          </div>

          {pkg.results.length > 1 && tab !== "steps" && tab !== "pdf" && (
            <div className="mb-4 flex flex-wrap gap-2">
              {pkg.results.map((d, i) => (
                <button
                  key={d.document_id}
                  onClick={() => setDocIndex(i)}
                  className={cx(
                    "rounded-md px-3 py-1.5 text-left text-xs ring-1",
                    i === docIndex ? "bg-indigo-50 text-indigo-800 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  <div className="font-medium">{d.file_name}</div>
                  <div className="text-[11px] opacity-75">
                    {d.document_type ?? "—"} · {d.page_count} pages
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "results" && doc && <DocumentView doc={doc} showRaw={showRaw} />}
          {tab === "results" && pkg.results.length === 0 && pkg.display_status === "completed" && (
            <p className="text-sm text-slate-500">No documents were produced.</p>
          )}
          {tab === "steps" && (
            <Card className="p-4">
              <StepsList steps={steps.data ?? []} detailed />
            </Card>
          )}
          {tab === "text" && doc && <PageText packageId={pkg.package_id} documentId={doc.document_id} />}
          {tab === "pdf" && (
            <Card className="overflow-hidden">
              {pkg.file_name.toLowerCase().endsWith(".pdf") ? (
                <iframe title="Original PDF" src={fileUrl(pkg.package_id)} className="h-[80vh] w-full" />
              ) : (
                <p className="p-6 text-sm text-slate-600">
                  ZIP uploads can&apos;t be previewed. <a className="text-indigo-600 underline" href={fileUrl(pkg.package_id)}>Download</a>
                </p>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function DocumentView({ doc, showRaw }: { doc: DocumentResult; showRaw: boolean }) {
  const [tableKey, setTableKey] = useState<string | null>(null);
  const active = doc.tables.find((t) => t.customer_key === tableKey) ?? doc.tables[0];
  const groups = doc.fields.reduce<Record<string, ExtractedField[]>>((acc, f) => {
    (acc[f.node_name] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Path:</span>
        {doc.path.map((n, i) => (
          <span key={n} className="flex items-center gap-2">
            {i > 0 && <span>→</span>}
            <Badge>{n}</Badge>
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {Object.entries(groups).map(([node, fields]) => (
          <Card key={node} className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{node}</h3>
            <dl className="space-y-3">
              {fields.map((f) => (
                <FieldValue key={f.customer_key} field={f} showRaw={showRaw} />
              ))}
            </dl>
          </Card>
        ))}
      </div>

      {doc.tables.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-2 pt-2">
            {doc.tables.map((t) => (
              <button
                key={t.customer_key}
                onClick={() => setTableKey(t.customer_key)}
                className={cx(
                  "rounded-t-md px-3 py-2 text-sm font-medium",
                  active?.customer_key === t.customer_key ? "bg-white text-indigo-700 ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {t.name} <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[11px] text-slate-700">{t.rows.length}</span>
              </button>
            ))}
          </div>
          {active && <DataTable key={active.customer_key} table={active} showRaw={showRaw} fileName={doc.file_name} />}
        </Card>
      )}

      {doc.findings.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Business rule findings</h3>
          <div className="space-y-3">
            {doc.findings.map((f, i) => (
              <div key={i} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone="amber">Row {f.row_index + 1}</Badge>
                  {f.violations.map((v) => (
                    <Badge key={v.rule} tone="slate">
                      {v.rule}
                    </Badge>
                  ))}
                  {f.llm_status === "error" && <Badge tone="red">review failed</Badge>}
                  {String(f.outputs.found_error ?? "").toLowerCase() === "yes" && <Badge tone="red">genuine error</Badge>}
                  {String(f.outputs.found_error ?? "").toLowerCase() === "no" && <Badge tone="green">acceptable</Badge>}
                </div>
                <ul className="ml-4 list-disc text-xs text-slate-600">
                  {f.violations.map((v) => (
                    <li key={v.rule}>{v.detail}</li>
                  ))}
                </ul>
                {f.outputs.domain_reasoning ? <p className="mt-2 text-xs text-slate-700">{String(f.outputs.domain_reasoning)}</p> : null}
                {f.applied_actions.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Applied:{" "}
                    {f.applied_actions.map((a) => `${a.field}: ${JSON.stringify(a.from)} → ${JSON.stringify(a.to)}`).join("; ")}
                  </p>
                )}
                {f.error && <p className="mt-1 text-xs text-red-600">{f.error}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function FieldValue({ field: f, showRaw }: { field: ExtractedField; showRaw: boolean }) {
  const value = showRaw ? f.raw : f.value;
  const text = formatValue(value, showRaw ? "string" : f.type);
  const yes = /^(yes|true)$/i.test(text);
  const no = /^(no|false)$/i.test(text);
  // For "found_error"-style fields, "No" is the good outcome.
  const inverted = /error/i.test(f.customer_key);
  const good = inverted ? no : yes;
  return (
    <div>
      <dt className="text-xs text-slate-500" title={f.customer_key}>
        {f.name}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-900">
        {f.error ? (
          <span className="text-red-600" title={f.error}>
            {String(f.raw)} <IconAlert className="inline h-3 w-3" />
          </span>
        ) : yes || no ? (
          <Badge tone={good ? "green" : "red"}>
            {good && <IconCheck className="h-3 w-3" />} {text}
          </Badge>
        ) : text ? (
          <span className="whitespace-pre-wrap break-words">{text}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </dd>
    </div>
  );
}

function StepsList({ steps, detailed, className }: { steps: Step[]; detailed?: boolean; className?: string }) {
  if (!steps.length) return <p className={cx("text-sm text-slate-500", className)}>No steps recorded yet.</p>;
  const attempts = Array.from(new Set(steps.map((s) => s.attempt)));
  return (
    <div className={cx("space-y-4", className)}>
      {attempts.map((a) => (
        <div key={a}>
          {attempts.length > 1 && <div className="mb-1 text-xs font-medium text-slate-500">Attempt {a}</div>}
          <ol className="space-y-1">
            {steps
              .filter((s) => s.attempt === a)
              .map((s, i) => (
                <li key={i} className="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                  <span
                    className={cx(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      s.status === "ok" ? "bg-emerald-500" : s.status === "error" ? "bg-red-500" : "bg-slate-300",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3">
                      <span className="font-medium text-slate-800">{s.node}</span>
                      {s.document_index !== null && <span className="text-xs text-slate-400">doc {s.document_index + 1}</span>}
                      <span className="text-xs tabular-nums text-slate-500">{formatDuration(s.duration_s)}</span>
                      {s.model && <span className="text-xs text-slate-500">{s.model}</span>}
                      {detailed && s.llm_calls > 0 && (
                        <span className="text-xs text-slate-400">
                          {s.llm_calls} call{s.llm_calls > 1 ? "s" : ""} · {s.prompt_tokens.toLocaleString()} in /{" "}
                          {s.completion_tokens.toLocaleString()} out
                        </span>
                      )}
                    </div>
                    {s.detail && <div className="truncate text-xs text-slate-500">{s.detail}</div>}
                    {s.error && <div className="text-xs text-red-600">{s.error}</div>}
                  </div>
                </li>
              ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function PageText({ packageId, documentId }: { packageId: number; documentId: number }) {
  const { data, error } = useSWR<{ page_number: number; text: string; ocr: boolean }[]>(
    `ex:/v1/packages/${packageId}/documents/${documentId}/pages`,
    fetcher,
  );
  return (
    <div className="space-y-4">
      <ErrorBanner error={error} />
      {!data && !error && <Spinner />}
      {data?.map((p) => (
        <Card key={p.page_number} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
            Page {p.page_number} {p.ocr && <Badge tone="violet">OCR</Badge>}
          </div>
          <pre className="scrollbar-thin overflow-x-auto whitespace-pre p-4 font-mono text-[11px] leading-4 text-slate-700">
            {p.text || "(no text)"}
          </pre>
        </Card>
      ))}
    </div>
  );
}
