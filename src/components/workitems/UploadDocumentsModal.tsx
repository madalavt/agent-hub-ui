"use client";

// Upload documents to test extraction (Documents page). For each file, like an automation's intake:
//   1. a work item in the project's queue, left `queued`, with a v1-style client id
//      "{project}_{document id}!{file name}" (the function app never picks it up: it only works
//      items its own intake created);
//   2. the file uploaded to the chosen decision tree configuration and linked to that item
//      (annotations /{item}/upload);
//   3. the file recorded on the item (POST /items/{id}/file with its package id).

import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { IconUpload } from "@/components/icons";
import { Button, ErrorBanner, Field, Modal, Select } from "@/components/ui";
import { ann, fetcher, wi } from "@/lib/api";
import type { ProjectPaths } from "@/lib/paths";
import type { Project } from "@/lib/types";

type Result = { file: string; itemId?: string; packageId?: number; error?: string };

function documentId(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `AH${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function UploadDocumentsModal({
  open,
  onClose,
  onUploaded,
  tenantId,
  queueId,
  projectName,
  defaultConfig,
  paths,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  tenantId: string;
  queueId: string;
  projectName: string;
  /** The tree configuration this project's queue was linked to before (old data), if any. */
  defaultConfig?: string | null;
  paths: ProjectPaths | null;
}) {
  const configs = useSWR<Project[]>(open ? `dt:/v1/customers/${tenantId}/projects` : null, fetcher);
  const trees = (configs.data ?? []).filter((c) => c.tree_id);
  const [chosen, setChosen] = useState("");
  // Default: the tree configuration named like the project (or its queue's old link), so a
  // Mortgage Change project does not extract with another org tree by accident.
  const suggested =
    trees.find((c) => c.name.toLowerCase() === projectName.toLowerCase()) ?? trees.find((c) => c.id === defaultConfig);
  const config = chosen || suggested?.id || trees[0]?.id || "";
  const [files, setFiles] = useState<File[]>([]);
  const [dropError, setDropError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const input = useRef<HTMLInputElement>(null);

  function pickFiles(list: File[]) {
    if (busy) return;
    const valid = list.filter((f) => /\.(pdf|zip)$/i.test(f.name));
    if (list.length > 0 && valid.length === 0) {
      setDropError("Only PDF or ZIP files are supported.");
      return;
    }
    setDropError(valid.length < list.length ? "Skipped unsupported files (only PDF and ZIP are allowed)." : null);
    setFiles(valid);
  }

  function close() {
    if (busy) return;
    setFiles([]);
    setDropError(null);
    setResults([]);
    if (input.current) input.current.value = "";
    onClose();
  }

  async function uploadOne(file: File): Promise<Result> {
    const docId = documentId();
    const clientId = `${projectName}_${docId}!${file.name}`;
    try {
      const created = await wi.post<{ itemIds: string[] }>("/items", {
        queueId,
        items: [
          {
            KEY: clientId,
            x_file_name: clientId,
            document_id: docId,
            custom_item_key: docId,
            file_name: file.name,
            content_type: file.type || "application/pdf",
            total_docs: 1,
            multi_doc_upload: false,
            run_type: "MANUAL_UPLOAD",
            source: "Agent Hub upload (extraction test)",
          },
        ],
      });
      const itemId = created.itemIds[0];
      const form = new FormData();
      form.append("files", file);
      form.append("project_id", config);
      const res = await ann.upload<unknown>(`/${itemId}/upload`, form);
      const pkgs = (Array.isArray(res) ? res : ((res as { packages?: unknown[] })?.packages ?? [])) as Record<string, unknown>[];
      const packageId = Number(pkgs[0]?.packageId ?? pkgs[0]?.package_id);
      if (Number.isFinite(packageId)) {
        await wi.post(`/items/${itemId}/file`, {
          files: [{ fileName: file.name, filePath: String(packageId), packageId }],
        });
      }
      return { file: file.name, itemId, packageId: Number.isFinite(packageId) ? packageId : undefined };
    } catch (e) {
      return { file: file.name, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function submit() {
    setBusy(true);
    setResults([]);
    const out: Result[] = [];
    for (const f of files) {
      out.push(await uploadOne(f));
      setResults([...out]);
    }
    setBusy(false);
    setFiles([]);
    if (input.current) input.current.value = "";
    onUploaded();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload documents"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {results.length ? "Close" : "Cancel"}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!files.length || !config}>
            Upload {files.length > 1 ? `${files.length} files` : ""}
          </Button>
        </>
      }
    >
      <ErrorBanner error={configs.error} />
      {dropError && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{dropError}</p>}
      <p className="text-sm text-slate-600">
        Each file becomes a work item in this project (status <b>Queued</b>) and is extracted with the decision tree you pick. The
        function app does not process these items.
      </p>
      <Field label="Decision tree">
        <Select value={config} onChange={(e) => setChosen(e.target.value)} disabled={!trees.length || busy}>
          {!trees.length && <option value="">{configs.data ? "No decision trees in this org" : "Loading…"}</option>}
          {trees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.tree_name ? ` · ${c.tree_name}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pickFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => !busy && input.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-violet-300 px-4 py-8 text-center text-sm text-slate-600 hover:bg-violet-50"
      >
        <IconUpload className="h-6 w-6 text-violet-600" />
        {files.length ? (
          <span className="font-medium text-slate-800">{files.map((f) => f.name).join(", ")}</span>
        ) : (
          <span>Drop PDF or ZIP files here, or click to choose</span>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.zip"
          className="hidden"
          onChange={(e) => {
            pickFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {results.length > 0 && (
        <ul className="space-y-1 text-sm">
          {results.map((r, idx) => (
            <li key={`${r.file}-${idx}`} className={r.error ? "text-red-700" : "text-emerald-700"}>
              {r.error ? (
                `${r.file}: ${r.error}`
              ) : (
                <>
                  {r.file}: work item created, package {r.packageId ?? "?"} extracting.{" "}
                  {paths && r.itemId && (
                    <Link href={paths.item(r.itemId, "documents")} className="text-violet-700 underline">
                      Open
                    </Link>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
