"use client";

import { useMemo, useState } from "react";
import { IconDownload } from "./icons";
import { Button, Input, cx } from "./ui";
import { download, formatValue, toCsv } from "@/lib/format";
import type { TableOut } from "@/lib/types";

const NUMERIC = new Set(["currency", "number"]);

export function DataTable({ table, showRaw, fileName }: { table: TableOut; showRaw: boolean; fileName: string }) {
  const [filter, setFilter] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);

  const columns = useMemo(() => {
    if (!hideEmpty) return table.columns;
    return table.columns.filter((c) =>
      table.rows.some((r) => {
        const v = showRaw ? r.raw?.[c.key] : r.values[c.key];
        return v !== null && v !== undefined && v !== "";
      }),
    );
  }, [table, hideEmpty, showRaw]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return table.rows;
    return table.rows.filter((r) => Object.values(r.values).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [table.rows, filter]);

  const exportCsv = () =>
    download(
      `${fileName.replace(/\.[^.]+$/, "")}_${table.customer_key}.csv`,
      toCsv(
        table.columns.map((c) => c.name),
        table.rows.map((r) => table.columns.map((c) => r.values[c.key])),
      ),
    );

  if (!table.rows.length) {
    return <p className="px-4 py-6 text-sm text-slate-500">No rows extracted for this table.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
        <Input className="max-w-xs" placeholder="Filter rows…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} className="rounded border-slate-300" />
          Hide empty columns ({table.columns.length - columns.length} hidden)
        </label>
        <span className="text-xs text-slate-500">
          {rows.length} of {table.rows.length} rows
        </span>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={exportCsv}>
          <IconDownload className="h-3.5 w-3.5" /> CSV
        </Button>
      </div>
      <div className="scrollbar-thin max-h-[560px] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium text-slate-500">#</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  title={`${c.key} · ${c.type}\n\n${c.description}`}
                  className={cx(
                    "whitespace-nowrap border-b border-slate-200 px-3 py-2 font-medium text-slate-600",
                    NUMERIC.has(c.type) ? "text-right" : "text-left",
                  )}
                >
                  {c.name.replace(/^(Policy|Claim) - /, "")}
                </th>
              ))}
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-500">Pages</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row_id} className="hover:bg-indigo-50/40">
                <td className="sticky left-0 border-b border-r border-slate-100 bg-white px-2 py-1.5 tabular-nums text-slate-400">
                  {r.row_index + 1}
                  {r.warnings.length > 0 && (
                    <span title={r.warnings.join("\n")} className="ml-1 text-amber-500">
                      ⚠
                    </span>
                  )}
                </td>
                {columns.map((c) => {
                  const error = r.errors[c.key];
                  const corrected = c.key in r.corrections;
                  const raw = r.raw?.[c.key];
                  const display = showRaw ? (raw === undefined ? "" : formatValue(raw, "string")) : formatValue(r.values[c.key], c.type);
                  return (
                    <td
                      key={c.key}
                      title={
                        error
                          ? `Could not read as ${c.type}: ${error}`
                          : corrected
                            ? `Corrected by business verifier (was ${JSON.stringify(r.corrections[c.key])})`
                            : undefined
                      }
                      className={cx(
                        "max-w-[280px] truncate border-b border-slate-100 px-3 py-1.5",
                        NUMERIC.has(c.type) && !showRaw ? "text-right tabular-nums" : "",
                        error && "bg-red-50 text-red-700",
                        corrected && "bg-amber-50 font-medium text-amber-800",
                      )}
                    >
                      {error && !showRaw ? <span className="italic">{String(raw ?? "")}</span> : display}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-slate-400">
                  {r.source_pages[0] === r.source_pages[1] ? r.source_pages[0] : `${r.source_pages[0]}–${r.source_pages[1]}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
