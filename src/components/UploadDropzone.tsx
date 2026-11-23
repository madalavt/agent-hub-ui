"use client";

import { useRef, useState } from "react";
import { IconUpload } from "./icons";
import { cx, ErrorBanner, Spinner } from "./ui";
import { ex } from "@/lib/api";
import type { Package } from "@/lib/types";

export function UploadDropzone({
  projectId,
  disabled,
  onUploaded,
}: {
  projectId: string;
  disabled?: boolean;
  onUploaded: (packages: Package[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const upload = async (files: File[]) => {
    const accepted = files.filter((f) => /\.(pdf|zip)$/i.test(f.name));
    if (!accepted.length) {
      setError(new Error("Only PDF or ZIP files can be uploaded."));
      return;
    }
    setError(null);
    setBusy(`Uploading ${accepted.length} file${accepted.length > 1 ? "s" : ""}…`);
    try {
      const form = new FormData();
      accepted.forEach((f) => form.append("files", f));
      onUploaded(await ex.upload<Package[]>(`/v1/projects/${projectId}/packages`, form));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div
        onClick={() => !disabled && !busy && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled && !busy) upload(Array.from(e.dataTransfer.files));
        }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition",
          disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60" : drag ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50",
        )}
      >
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Spinner /> {busy}
          </div>
        ) : (
          <>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <IconUpload className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-slate-800">
              {disabled ? "Assign a decision tree to this project to upload documents" : "Drop PDFs or ZIPs here, or click to browse"}
            </p>
            <p className="mt-1 text-xs text-slate-500">Each file becomes a package. A ZIP is split into one document per PDF.</p>
          </>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.zip,application/pdf,application/zip"
          className="hidden"
          onChange={(e) => upload(Array.from(e.target.files ?? []))}
        />
      </div>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
