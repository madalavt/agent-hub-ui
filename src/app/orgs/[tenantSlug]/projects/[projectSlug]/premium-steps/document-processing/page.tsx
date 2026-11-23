"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import { ConfigurationModal } from "@/components/ConfigurationModal";
import { IconTree, IconUpload } from "@/components/icons";
import { Button, EmptyState, ErrorBanner, Input, Modal, Spinner, Textarea } from "@/components/ui";
import { PurpleButton } from "@/components/workitems/bits";
import { dt, fetcher } from "@/lib/api";
import { projectPaths } from "@/lib/paths";
import { canWriteCustomer, useSession } from "@/lib/session";
import type { IgptCustomer } from "@/lib/types";

type ImportReport = { tree_id: string; name: string; models: string[]; dropped_secrets: { model: string; keys: string[] }[]; warnings: string[] };

// Decision Tree Library (/orgs/{tenant}/projects/{project}/premium-steps/document-processing, like
// v1): the org's decision tree configurations, read from /api/roots-igpt/customer/{tenant}. They
// belong to the org, not to the project in the URL: every member sees all of them. Automations
// upload documents to a configuration by its integer id. OPEN goes to the configurator.
function LibraryPage() {
  const router = useRouter();
  const { tenantSlug, projectSlug } = useParams<{ tenantSlug: string; projectSlug: string }>();
  const me = useSession().data;
  const isAdmin = me?.role === "admin";
  const canWrite = canWriteCustomer(me, tenantSlug);
  const customer = useSWR<IgptCustomer>(`ig:/customer/${tenantSlug}`, fetcher);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const library = projectPaths(tenantSlug, projectSlug).library;
  const configurator = (id: string) => `${library}/${id}/configurator`;
  const configs = customer.data?.customer.configurations ?? [];

  return (
    <div className="px-10 pb-16 pt-12">
      <div className="mb-12 mt-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-slab text-[44px] font-bold leading-none tracking-tight text-slate-950">Document Processing</h1>
        <div className="flex gap-3">
          {isAdmin && (
            <PurpleButton variant="outline" className="px-5 py-3 uppercase tracking-wide" onClick={() => setImporting(true)}>
              <IconUpload className="h-4 w-4" /> Import
            </PurpleButton>
          )}
          {canWrite && (
            <PurpleButton className="px-5 py-3 uppercase tracking-wide" onClick={() => setCreating(true)}>
              New decision tree
            </PurpleButton>
          )}
        </div>
      </div>
      <ErrorBanner error={customer.error} />
      {customer.isLoading && <Spinner className="h-5 w-5 text-slate-400" />}
      {customer.data && configs.length === 0 && (
        <EmptyState icon={<IconTree />} title="No decision trees yet" description="Decision trees belong to the org; automations upload documents to one by its id." />
      )}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {configs.map((c) => (
          <div key={c.id} className="flex min-h-[300px] flex-col rounded border border-slate-300 bg-white p-10">
            <h3 className="font-slab text-[24px] font-bold leading-tight text-slate-950">{c.name}</h3>
            {c.description && <p className="mt-6 line-clamp-3 text-[17px] text-slate-800">{c.description}</p>}
            {!c.tree_id && <p className="mt-3 text-sm text-amber-700">No decision tree yet</p>}
            {c.doc_processing_project_id && (
              <p className="mt-3 text-sm text-slate-500" title="The id automations upload documents to (PLATFORM_DOC_PROJECT_ID)">
                Document project ID: <span className="font-mono">{c.doc_processing_project_id}</span>
              </p>
            )}
            <div className="mt-auto pt-8">
              <Link href={configurator(c.id)}>
                <PurpleButton variant="outline" className="px-7 py-3 uppercase tracking-wide">
                  Open
                </PurpleButton>
              </Link>
            </div>
          </div>
        ))}
      </div>
      <ConfigurationModal
        open={creating}
        customerId={tenantSlug}
        onClose={() => setCreating(false)}
        onSaved={(p) => {
          setCreating(false);
          customer.mutate();
          router.push(configurator(p.id));
        }}
      />
      <ImportModal
        open={importing}
        customerId={tenantSlug}
        onClose={() => setImporting(false)}
        onImported={(r) => {
          setImporting(false);
          router.push(`/trees/${r.tree_id}`);
        }}
      />
    </div>
  );
}

function ImportModal({
  open,
  customerId,
  onClose,
  onImported,
}: {
  open: boolean;
  customerId: string;
  onClose: () => void;
  onImported: (r: ImportReport) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setText("");
    setName("");
    setError(null);
    setReport(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = JSON.parse(text);
      const qs = new URLSearchParams({ ...(name ? { name } : {}), ...(customerId ? { customer_id: customerId } : {}) });
      const r = await dt.post<ImportReport>(`/v1/trees/import?${qs}`, payload);
      setReport(r);
      if (!r.dropped_secrets.length && !r.warnings.length) {
        setText("");
        setName("");
        setReport(null);
        onImported(r);
      }
    } catch (e) {
      setError(e instanceof SyntaxError ? new Error(`Invalid JSON: ${e.message}`) : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="Import decision tree"
      footer={
        report ? (
          <Button
            onClick={() => {
              const r = report;
              close();
              onImported(r);
            }}
          >
            Open imported tree
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={run} loading={busy} disabled={!text.trim()}>
              Import
            </Button>
          </>
        )
      }
    >
      {report ? (
        <div className="space-y-3 text-sm">
          <p className="text-emerald-700">
            Imported <b>{report.name}</b> with models: {report.models.join(", ") || "none"}.
          </p>
          {report.dropped_secrets.length > 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-amber-800 ring-1 ring-amber-200">
              <p className="font-medium">Secrets were removed from model parameters</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {report.dropped_secrets.map((d) => (
                  <li key={d.model}>
                    {d.model}: {d.keys.join(", ")}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Put credentials in config/credentials.yaml instead.</p>
            </div>
          )}
          {report.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700">
              {w}
            </p>
          ))}
        </div>
      ) : (
        <>
          <ErrorBanner error={error} />
          <p className="text-sm text-slate-600">
            Paste or load a configuration export from Platform-DecisionTree-API (<code>{"{ data: { configuration: { tree } } }"}</code>). To
            wire up nodes the export has no branches for, you can wrap it as{" "}
            <code>{'{ "export": …, "branches": [{"parent": "A", "child": "B", "condition": "…"}], "starting_node": "A" }'}</code>.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <IconUpload /> Choose file
            </Button>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tree name (optional)" />
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
              }}
            />
          </div>
          <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"data": {"configuration": {...}}}' />
        </>
      )}
    </Modal>
  );
}

// Every member of the org sees its library; changes need Update on the org (or admin).
export default function LibraryRoute() {
  return <LibraryPage />;
}
