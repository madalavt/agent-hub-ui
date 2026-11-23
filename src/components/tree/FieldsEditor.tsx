"use client";

// A node's fields as v1 shows them in the FIELDS tab: one card per field (icon, name, type),
// a ⋮ menu (move, delete) and a chevron that opens Field Name / Key / Type / Description. A table
// field lists its Columns as nested cards with their own ADD button.

import { useState } from "react";
import { IconChevronDown, IconFolder, IconPlus } from "../icons";
import { cx } from "../ui";
import { Popover } from "../workitems/bits";
import { field, uid } from "./presets";
import { slugKey } from "@/lib/format";
import type { FieldGraph, FieldType } from "@/lib/types";

export const TYPE_LABEL: Record<FieldType, string> = {
  string: "Text",
  number: "Number",
  currency: "Currency",
  date: "Date",
  boolean: "Boolean",
  table: "Table",
};

/** MUI-style outlined control: the label sits in the top border. */
export function Outlined({
  label,
  required,
  help,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-4", className)}>
      <fieldset className="min-w-0 flex-1 rounded border border-slate-300 px-[18px] pb-2.5 focus-within:border-violet-600 focus-within:ring-1 focus-within:ring-violet-600">
        <legend className="-ml-1 px-1.5 text-[13px] text-slate-600">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </legend>
        {children}
      </fieldset>
      {help && (
        <span
          title={help}
          className="flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border-[1.5px] border-slate-500 text-[11px] font-semibold text-slate-500"
        >
          ?
        </span>
      )}
    </div>
  );
}

export const outlinedInput = "block w-full bg-transparent text-[16px] text-slate-950 outline-none placeholder:text-slate-400 disabled:text-slate-500";

function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 text-slate-800" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

export function FieldsEditor({
  fields,
  onChange,
  allowTable = true,
  title = "Fields",
  nested = false,
  readOnly = false,
}: {
  fields: FieldGraph[];
  onChange: (fields: FieldGraph[]) => void;
  allowTable?: boolean;
  title?: string;
  nested?: boolean;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set(!nested && fields.length === 1 ? [0] : []));
  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const update = (i: number, patch: Partial<FieldGraph>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen((s) => new Set(Array.from(s).map((x) => (x === i ? j : x === j ? i : x))));
  };
  const remove = (i: number) => {
    onChange(fields.filter((_, j) => j !== i));
    setOpen((s) => new Set(Array.from(s).filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))));
  };
  const add = () => {
    const base = nested ? "column" : "field";
    const keys = new Set(fields.map((f) => f.customer_key));
    let n = fields.length + 1;
    while (keys.has(`${base}_${n}`)) n++;
    onChange([...fields, { ...field(`New ${nested ? "Column" : "Field"} ${n}`, `${base}_${n}`), id: uid() }]);
    setOpen((s) => new Set(s).add(fields.length));
  };

  return (
    <div>
      <div className={cx("flex items-center justify-between", nested ? "mb-6 mt-2" : "mb-8")}>
        <h3 className={cx("font-slab font-bold text-slate-950", nested ? "text-[17px]" : "text-[19px]")}>{title}</h3>
        {!readOnly && (
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-2.5 rounded border border-violet-300 px-3 py-1.5 text-[14px] font-medium uppercase tracking-wide text-violet-700 hover:bg-violet-50"
          >
            <IconPlus className="h-4 w-4" /> Add
          </button>
        )}
      </div>
      <div className={cx("space-y-4", !nested && "space-y-6")}>
        {fields.map((f, i) => {
          const expanded = open.has(i);
          const cardKey = f.id ?? `${f.customer_key}-${i}`;
          return (
            <div key={cardKey} className="rounded-md bg-white shadow-[0_1px_5px_rgba(15,23,42,0.18)]">
              <div className="flex items-start gap-4 px-5 py-4">
                {f.field_type === "table" ? <TableIcon /> : <IconFolder className="mt-0.5 h-6 w-6 shrink-0 text-slate-800" strokeWidth={1.8} />}
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggle(i)}>
                  <div className="text-[17px] font-semibold text-slate-950 [overflow-wrap:anywhere]">{f.name || "Untitled"}</div>
                  <div className="mt-0.5 text-[15px] text-slate-800">{TYPE_LABEL[f.field_type]}</div>
                </button>
                {!readOnly && (
                  <Popover
                    width="w-40"
                    trigger={(_, t) => (
                      <button type="button" onClick={t} aria-label={`Actions for ${f.name}`} className="rounded px-2 py-1 text-2xl leading-none text-violet-600 hover:bg-violet-50">
                        ⋮
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="-m-1 text-sm">
                        <button type="button" disabled={i === 0} onClick={() => (close(), move(i, -1))} className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40">
                          Move up
                        </button>
                        <button
                          type="button"
                          disabled={i === fields.length - 1}
                          onClick={() => (close(), move(i, 1))}
                          className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40"
                        >
                          Move down
                        </button>
                        <button type="button" onClick={() => (close(), remove(i))} className="block w-full rounded px-2 py-1.5 text-left text-red-700 hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    )}
                  </Popover>
                )}
                <button type="button" onClick={() => toggle(i)} aria-label={expanded ? "Collapse" : "Expand"} className="rounded p-1 text-slate-600 hover:bg-slate-100">
                  <IconChevronDown className={cx("h-6 w-6 transition-transform", !expanded && "rotate-180")} />
                </button>
              </div>
              {expanded && (
                <div className={cx("space-y-5 pb-6 pr-5", nested ? "pl-5" : "pl-[72px]")}>
                  <Outlined label="Field Name" required help="The label shown to reviewers and used in the prompt's {extraction_fields}.">
                    <input
                      className={outlinedInput}
                      disabled={readOnly}
                      value={f.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const autoKey = slugKey(f.name) === f.customer_key || /^(field|column)_\d+$/.test(f.customer_key);
                        update(i, { name, ...(autoKey ? { customer_key: slugKey(name) || f.customer_key } : {}) });
                      }}
                    />
                  </Outlined>
                  <Outlined label="Key" required help="The key the value is stored under (customer_key). Keep it stable once documents are processed.">
                    <input className={outlinedInput} disabled={readOnly} value={f.customer_key} onChange={(e) => update(i, { customer_key: e.target.value })} />
                  </Outlined>
                  <Outlined label="Type">
                    <select
                      className={cx(outlinedInput, "cursor-pointer")}
                      disabled={readOnly}
                      value={f.field_type}
                      onChange={(e) => {
                        const t = e.target.value as FieldType;
                        update(i, { field_type: t, child_fields: t === "table" ? (f.child_fields.length ? f.child_fields : [{ ...field("Column 1", "column_1"), id: uid() }]) : [] });
                      }}
                    >
                      {(Object.keys(TYPE_LABEL) as FieldType[])
                        .filter((t) => (allowTable && !nested) || t !== "table" || t === f.field_type)
                        .map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABEL[t]}
                          </option>
                        ))}
                    </select>
                  </Outlined>
                  <Outlined label="Description" help="Sent to the model with the field: what the value is and how to find it.">
                    <textarea
                      rows={2}
                      disabled={readOnly}
                      className={cx(outlinedInput, "resize-none text-[15px] [field-sizing:content]")}
                      value={f.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                    />
                  </Outlined>
                  {f.field_type === "table" && (
                    <FieldsEditor key={`${cardKey}-cols`} fields={f.child_fields} onChange={(child_fields) => update(i, { child_fields })} allowTable={false} title="Columns" nested readOnly={readOnly} />
                  )}
                </div>
              )}
            </div>
          );
        })}
        {fields.length === 0 && <p className="text-[15px] text-slate-500">No {title.toLowerCase()} yet.</p>}
      </div>
    </div>
  );
}
