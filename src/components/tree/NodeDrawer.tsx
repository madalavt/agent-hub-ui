"use client";

// The node drawer, like v1: the node's name as the title, DETAILS (Name, Type, Model, Parameters
// as JSON), FIELDS and BRANCHES tabs, and CANCEL / UPDATE. Edits stay in a draft until UPDATE.
// Page chunking is a code node's job, as in v1: tables.chunking.process reads
// parameters.chunk_params {pdf_size_to_chunk, pdf_chunk_size}.

import { useEffect, useMemo, useState } from "react";
import { IconPlus } from "../icons";
import { ErrorBanner, cx } from "../ui";
import { Popover } from "../workitems/bits";
import { FieldsEditor, Outlined, outlinedInput } from "./FieldsEditor";
import { CODE_FUNCTIONS, DEFAULT_CHUNK_PARAMS, uid } from "./presets";
import type { BranchGraph, NodeGraph, TreeGraph } from "@/lib/types";

export type DrawerTab = "details" | "fields" | "branches";
export const NEW_NODE = "__new_node__";

export interface DrawerState {
  node: NodeGraph;
  isNew: boolean;
  /** True when the drawer was opened with a pending change (e.g. a newly dragged branch). */
  forceDirty?: boolean;
  /** For a new child node: the branch from its parent. */
  incoming: BranchGraph | null;
  /** The node's outgoing branches, in evaluation order. */
  branches: BranchGraph[];
  tab: DrawerTab;
}

export interface DrawerModel {
  id: string;
  name: string;
}

const CHUNKING = "tables.chunking.process";

function retype(node: NodeGraph, type: NodeGraph["type"]): NodeGraph {
  const p = { ...node.parameters };
  if (type === "code_node") {
    return { ...node, type, parameters: { function: CHUNKING, chunk_params: { ...DEFAULT_CHUNK_PARAMS }, ...p } };
  }
  delete p.function;
  delete p.chunk_params;
  return { ...node, type, parameters: p };
}

export function NodeDrawer({
  state,
  tree,
  models,
  saving,
  error,
  readOnly = false,
  onDirtyChange,
  onCancel,
  onUpdate,
  onDelete,
  onDismissError,
}: {
  state: DrawerState;
  tree: TreeGraph;
  models: DrawerModel[];
  saving: boolean;
  error: unknown;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
  onUpdate: (draft: DrawerState) => void;
  onDelete: () => void;
  onDismissError: () => void;
}) {
  const [draft, setDraft] = useState<DrawerState>(state);
  const [tab, setTab] = useState<DrawerTab>(state.tab);
  const [paramsText, setParamsText] = useState(() => JSON.stringify(state.node.parameters, null, 2));
  const [paramsError, setParamsError] = useState<string | null>(null);
  useEffect(() => setTab(state.tab), [state.tab]);

  const node = draft.node;
  const setNode = (n: NodeGraph, syncParams = false) => {
    setDraft((d) => ({ ...d, node: n }));
    if (syncParams) {
      setParamsText(JSON.stringify(n.parameters, null, 2));
      setParamsError(null);
    }
  };
  const dirty = useMemo(
    () => !readOnly && (state.isNew || Boolean(state.forceDirty) || JSON.stringify({ ...draft, tab: 0 }) !== JSON.stringify({ ...state, tab: 0 })),
    [draft, state, readOnly],
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const fn = typeof node.parameters.function === "string" ? node.parameters.function : null;

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[980px] flex-col bg-white shadow-[-10px_0_30px_rgba(15,23,42,0.18)] sm:w-[58%] sm:min-w-[560px]">
      <div className="px-6 pt-8 sm:px-12">
        <h2 className="font-slab text-[24px] font-bold text-slate-950 [overflow-wrap:anywhere]">{node.name || "New node"}</h2>
      </div>
      <div className="mt-6 flex gap-2 px-4 sm:px-10">
        {(["details", "fields", "branches"] as DrawerTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              "border-b-[3px] px-5 py-3.5 text-[15px] font-semibold uppercase tracking-wide sm:px-8",
              tab === t ? "border-violet-600 text-violet-700" : "border-transparent text-slate-900 hover:text-violet-700",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-8 sm:px-12">
        {tab === "details" && (
          <div className="space-y-7">
            <Outlined label="Name">
              <input className={outlinedInput} disabled={readOnly} value={node.name} onChange={(e) => setNode({ ...node, name: e.target.value })} autoFocus={state.isNew} />
            </Outlined>
            <Outlined label="Type">
              <select
                className={cx(outlinedInput, "cursor-pointer")}
                disabled={readOnly}
                value={node.type}
                onChange={(e) => setNode(retype(node, e.target.value as NodeGraph["type"]), true)}
              >
                <option value="gpt_node">GPT Node</option>
                <option value="code_node">Code Node</option>
              </select>
            </Outlined>
            <Outlined label="Model">
              <select className={cx(outlinedInput, "cursor-pointer")} disabled={readOnly} value={node.mlmodel_id ?? ""} onChange={(e) => setNode({ ...node, mlmodel_id: e.target.value || null })}>
                <option value="">Default model</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Outlined>
            <div>
              <Outlined label="Parameters">
                <textarea
                  spellCheck={false}
                  disabled={readOnly}
                  className={cx(outlinedInput, "min-h-[220px] resize-none leading-relaxed [field-sizing:content]")}
                  value={paramsText}
                  onChange={(e) => {
                    setParamsText(e.target.value);
                    try {
                      const parsed = JSON.parse(e.target.value || "{}");
                      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Parameters must be a JSON object.");
                      setParamsError(null);
                      setNode({ ...node, parameters: parsed });
                    } catch (err) {
                      setParamsError((err as Error).message);
                    }
                  }}
                />
              </Outlined>
              {paramsError && <p className="mt-2 text-sm text-red-700">Invalid JSON: {paramsError}</p>}
              <ParamsHelp type={node.type} fn={fn} />
            </div>
            {!state.isNew && !readOnly && (
              <button
                type="button"
                onClick={() => confirm(`Delete the node ${node.name} and its branches?`) && onDelete()}
                className="text-sm font-medium text-red-700 hover:underline"
              >
                Delete node
              </button>
            )}
          </div>
        )}
        {tab === "fields" && (
          <FieldsEditor key={node.id} fields={node.fields} onChange={(fields) => setNode({ ...node, fields })} allowTable={fn === CHUNKING} readOnly={readOnly} />
        )}
        {tab === "branches" && (
          <BranchesTab tree={tree} node={node} incoming={draft.incoming} branches={draft.branches} readOnly={readOnly} onChange={(branches) => setDraft((d) => ({ ...d, branches }))} />
        )}
      </div>
      {!!error && (
        <div className="max-h-40 overflow-y-auto border-t border-slate-200 px-6 pt-3">
          <ErrorBanner error={error} onDismiss={onDismissError} />
        </div>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
        <button type="button" onClick={onCancel} className="rounded px-5 py-2.5 text-[16px] font-semibold uppercase tracking-wide text-violet-700 hover:bg-violet-50">
          {readOnly ? "Close" : "Cancel"}
        </button>
        {!readOnly && (
          <button
            type="button"
            disabled={!dirty || !!paramsError || saving || !node.name.trim()}
            onClick={() => onUpdate({ ...draft, tab })}
            className="rounded bg-violet-600 px-7 py-2.5 text-[16px] font-semibold uppercase tracking-wide text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Updating…" : "Update"}
          </button>
        )}
      </div>
    </aside>
  );
}

function ParamsHelp({ type, fn }: { type: NodeGraph["type"]; fn: string | null }) {
  return (
    <details className="mt-3 text-[13px] text-slate-600">
      <summary className="cursor-pointer select-none text-slate-700">Parameter reference</summary>
      <ul className="mt-2 space-y-1.5">
        <li>
          <code className="text-violet-700">prompt_template</code> {"{system, human, ai}"}: placeholders <code>{"{text}"}</code> (the document) and{" "}
          <code>{"{extraction_fields}"}</code> (this node&apos;s fields).
        </li>
        {type === "gpt_node" ? (
          <li>A GPT node returns a JSON object of its fields. Page chunking runs only in a Code Node with tables.chunking.process.</li>
        ) : (
          <>
            <li>
              <code className="text-violet-700">function</code>, one of:
            </li>
            {CODE_FUNCTIONS.map((f) => (
              <li key={f.name} className={cx("ml-4", f.name === fn && "font-medium text-slate-800")}>
                <code>{f.name}</code>: {f.help}
              </li>
            ))}
          </>
        )}
      </ul>
    </details>
  );
}

function BranchesTab({
  tree,
  node,
  incoming,
  branches,
  readOnly = false,
  onChange,
}: {
  tree: TreeGraph;
  node: NodeGraph;
  incoming: BranchGraph | null;
  branches: BranchGraph[];
  readOnly?: boolean;
  onChange: (b: BranchGraph[]) => void;
}) {
  // A node has one parent: targets are nodes without a parent elsewhere (and not the start).
  const takenElsewhere = new Set(tree.branches.filter((b) => b.parent_node_id !== node.id).map((b) => b.child_node_id));
  const targets = tree.nodes.filter((n) => n.id !== node.id && n.id !== tree.starting_node_id && !takenElsewhere.has(n.id) && n.id !== incoming?.parent_node_id);
  const update = (i: number, patch: Partial<BranchGraph>) => onChange(branches.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= branches.length) return;
    const next = [...branches];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const free = targets.find((t) => !branches.some((b) => b.child_node_id === t.id));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-slab text-[19px] font-bold text-slate-950">Branches</h3>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onChange([...branches, { id: uid(), parent_node_id: node.id, child_node_id: free?.id ?? NEW_NODE, name: "", condition: "" }])}
            className="flex items-center gap-2.5 rounded border border-violet-300 px-3 py-1.5 text-[14px] font-medium uppercase tracking-wide text-violet-700 hover:bg-violet-50"
          >
            <IconPlus className="h-4 w-4" /> Add
          </button>
        )}
      </div>
      <p className="mb-6 text-[13px] text-slate-600">
        After this node runs, every branch whose condition is true runs its next node, in this order. An empty condition (or True) always runs.
      </p>
      <div className="space-y-6">
        {branches.map((b, i) => {
          const used = new Set(branches.filter((_, j) => j !== i).map((x) => x.child_node_id));
          return (
            <div key={b.id ?? i} className="space-y-5 rounded-md bg-white px-5 pb-6 pt-4 shadow-[0_1px_5px_rgba(15,23,42,0.18)]">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium uppercase tracking-wide text-slate-500">Branch {i + 1}</span>
                {!readOnly && (
                  <Popover
                    width="w-40"
                    trigger={(_, t) => (
                      <button type="button" onClick={t} aria-label={`Actions for branch ${i + 1}`} className="rounded px-2 py-1 text-2xl leading-none text-violet-600 hover:bg-violet-50">
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
                          disabled={i === branches.length - 1}
                          onClick={() => (close(), move(i, 1))}
                          className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40"
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          onClick={() => (close(), onChange(branches.filter((_, j) => j !== i)))}
                          className="block w-full rounded px-2 py-1.5 text-left text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </Popover>
                )}
              </div>
              <Outlined label="Name" help="Shown on the branch's line in the tree, e.g. Mortgage Change.">
                <input className={outlinedInput} disabled={readOnly} value={b.name ?? ""} onChange={(e) => update(i, { name: e.target.value })} placeholder="Connection" />
              </Outlined>
              <Outlined
                label="Condition"
                help={'Tests fields extracted so far, e.g. document_type == "Mortgage Change", document_type in ["A", "B"], a == "No" or b == "No". Comparisons ignore case and surrounding spaces.'}
              >
                <textarea
                  rows={1}
                  spellCheck={false}
                  disabled={readOnly}
                  className={cx(outlinedInput, "resize-none font-mono text-[14px] [field-sizing:content]")}
                  value={b.condition ?? ""}
                  onChange={(e) => update(i, { condition: e.target.value })}
                  placeholder='document_type == "Mortgage Change"'
                />
              </Outlined>
              <Outlined label="Next node">
                <select className={cx(outlinedInput, "cursor-pointer")} disabled={readOnly} value={b.child_node_id} onChange={(e) => update(i, { child_node_id: e.target.value })}>
                  {targets
                    .filter((t) => t.id === b.child_node_id || !used.has(t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  <option value={NEW_NODE}>+ New node</option>
                </select>
              </Outlined>
            </div>
          );
        })}
        {branches.length === 0 && <p className="text-[15px] text-slate-500">No branches: extraction ends after this node.</p>}
      </div>
    </div>
  );
}

/** Drawer for the tree's own settings (name, description, business context). */
export function TreeSettingsDrawer({
  tree,
  saving,
  error,
  readOnly = false,
  onDirtyChange,
  onCancel,
  onUpdate,
  onDismissError,
}: {
  tree: TreeGraph;
  saving: boolean;
  error: unknown;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
  onUpdate: (t: Pick<TreeGraph, "name" | "description" | "business_context">) => void;
  onDismissError: () => void;
}) {
  const [d, setD] = useState({ name: tree.name, description: tree.description, business_context: tree.business_context });
  const dirty = !readOnly && (d.name !== tree.name || d.description !== tree.description || d.business_context !== tree.business_context);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[720px] flex-col bg-white shadow-[-10px_0_30px_rgba(15,23,42,0.18)] sm:w-[45%] sm:min-w-[480px]">
      <div className="px-6 pt-8 sm:px-12">
        <h2 className="font-slab text-[24px] font-bold text-slate-950">Tree settings</h2>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-10 pt-8 sm:px-12">
        <Outlined label="Name" required>
          <input className={outlinedInput} disabled={readOnly} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Outlined>
        <Outlined label="Description">
          <textarea className={cx(outlinedInput, "resize-none [field-sizing:content]")} disabled={readOnly} rows={2} value={d.description ?? ""} onChange={(e) => setD({ ...d, description: e.target.value || null })} />
        </Outlined>
        <Outlined label="Business context" help="Background about the customer and documents, available to prompts.">
          <textarea
            disabled={readOnly}
            className={cx(outlinedInput, "min-h-[120px] resize-none [field-sizing:content]")}
            value={d.business_context ?? ""}
            onChange={(e) => setD({ ...d, business_context: e.target.value || null })}
          />
        </Outlined>
        <p className="text-[13px] text-slate-600">
          Extraction starts at the node joined to Start and follows every branch whose condition matches. Changes apply to documents processed after
          you update; reprocess older documents to use them.
        </p>
      </div>
      {!!error && (
        <div className="max-h-40 overflow-y-auto border-t border-slate-200 px-6 pt-3">
          <ErrorBanner error={error} onDismiss={onDismissError} />
        </div>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
        <button type="button" onClick={onCancel} className="rounded px-5 py-2.5 text-[16px] font-semibold uppercase tracking-wide text-violet-700 hover:bg-violet-50">
          {readOnly ? "Close" : "Cancel"}
        </button>
        {!readOnly && (
          <button
            type="button"
            disabled={!dirty || saving || !d.name.trim()}
            onClick={() => onUpdate(d)}
            className="rounded bg-violet-600 px-7 py-2.5 text-[16px] font-semibold uppercase tracking-wide text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Updating…" : "Update"}
          </button>
        )}
      </div>
    </aside>
  );
}
