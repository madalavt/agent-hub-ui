"use client";

// Decision tree editor, like v1's: a left-to-right canvas (Start → nodes → Extraction End) with
// branch names on the lines. Clicking a node opens its drawer (DETAILS / FIELDS / BRANCHES); UPDATE
// saves the tree. A node's "+" adds a child; dragging from a handle onto a node adds a branch
// (from Start: makes that node the starting node). Moved nodes are kept with "Save layout".

import {
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";
import { IconCheck, IconPlus, IconTree } from "../icons";
import { ApiError, dt } from "@/lib/api";
import type { BranchGraph, NodeGraph, TreeGraph } from "@/lib/types";
import { Badge, ErrorBanner, cx } from "../ui";
import { NEW_NODE, NodeDrawer, TreeSettingsDrawer, type DrawerModel, type DrawerState, type DrawerTab } from "./NodeDrawer";
import { autoLayout, newNode, uid } from "./presets";
import { EndNode, StartNode, TreeNodeCard, type TreeFlowNode } from "./TreeNodeCard";

const nodeTypes = { tree: TreeNodeCard, start: StartNode, end: EndNode };
const START = "__start";
const endId = (id: string) => `__end:${id}`;
type XY = { x: number; y: number };

const EDGE_STYLE = { stroke: "#7c3aed", strokeWidth: 1 };
const LABEL = {
  labelStyle: { fontSize: 10, fill: "#6d28d9" },
  labelBgStyle: { fill: "#ffffff", fillOpacity: 0.85 },
  labelBgPadding: [3, 1] as [number, number],
};

function unconditional(c: string | null | undefined) {
  return ["", "true", "always"].includes((c ?? "").trim().toLowerCase());
}

function issues(tree: TreeGraph, n: NodeGraph): string[] {
  const out: string[] = [];
  const pt = n.parameters.prompt_template ?? {};
  const fn = n.parameters.function;
  if (!pt.system && !pt.human) out.push("No prompt_template.");
  if (fn === "tables.chunking.process" && !n.fields.some((f) => f.field_type === "table")) out.push("No table field.");
  if (typeof fn === "string" && fn.startsWith("verifiers.") && !n.parameters.table_key) out.push("No table_key.");
  if (tree.nodes.filter((x) => x.name === n.name).length > 1) out.push("Duplicate name.");
  return out;
}

function uniqueName(names: Set<string>, base = "New Node") {
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

type EditorProps = { initial: TreeGraph; models: DrawerModel[]; backHref?: string; backLabel?: string; readOnly?: boolean };

function Editor({ initial, models, backHref = "/", backLabel = "Home", readOnly = false }: EditorProps) {
  const rf = useReactFlow();
  const [tree, setTree] = useState<TreeGraph>(initial);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);
  const [drawerDirty, setDrawerDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const positions = useRef<Record<string, XY>>({
    ...autoLayout(initial.nodes, initial.branches, initial.starting_node_id),
    ...(initial.layout?.positions ?? {}),
  });
  const [rfNodes, setRfNodes] = useState<TreeFlowNode[]>([]);
  const defaultModel = tree.nodes.find((n) => n.id === tree.starting_node_id)?.mlmodel_id ?? models[0]?.id ?? null;

  const rfRef = useRef<TreeFlowNode[]>([]);
  rfRef.current = rfNodes;
  const drawerDirtyRef = useRef(false);
  drawerDirtyRef.current = drawerDirty;
  const confirmDiscard = useCallback(() => {
    if (!drawerDirtyRef.current) return true;
    return confirm("You have unsaved changes in the drawer. Discard them?");
  }, []);

  const posOf = useCallback(
    (key: string, fallback: XY): XY => rfRef.current.find((n) => n.id === key)?.position ?? positions.current[key] ?? fallback,
    [],
  );

  const openNode = useCallback(
    (id: string, tab: DrawerTab = "details", extra?: BranchGraph) => {
      if (!confirmDiscard()) return;
      const node = tree.nodes.find((n) => n.id === id);
      if (!node) return;
      setSettingsOpen(false);
      setError(null);
      setDrawerDirty(Boolean(extra));
      setDrawer({
        node: structuredClone(node),
        isNew: false,
        forceDirty: Boolean(extra),
        incoming: null,
        branches: [...tree.branches.filter((b) => b.parent_node_id === id).map((b) => ({ ...b })), ...(extra ? [extra] : [])],
        tab,
      });
      setDrawerKey((k) => k + 1);
    },
    [tree, confirmDiscard],
  );

  const draftNode = useCallback(
    (at: XY, incoming: BranchGraph | null) => {
      if (readOnly || !confirmDiscard()) return;
      const node = newNode("gpt", tree, defaultModel);
      node.name = uniqueName(new Set(tree.nodes.map((n) => n.name)));
      positions.current[node.id] = at;
      setSettingsOpen(false);
      setError(null);
      setDrawerDirty(true);
      setDrawer({ node, isNew: true, incoming: incoming && { ...incoming, child_node_id: node.id }, branches: [], tab: "details" });
      setDrawerKey((k) => k + 1);
    },
    [tree, defaultModel, readOnly, confirmDiscard],
  );

  const addChild = useCallback(
    (parentId: string) => {
      if (readOnly) return;
      if (parentId === START) {
        const start = tree.nodes.find((n) => n.id === tree.starting_node_id);
        if (start) {
          setNotice(`Start already leads to ${start.name}. Add nodes after it with its "+".`);
          return;
        }
        const s = posOf(START, { x: -380, y: 20 });
        draftNode({ x: s.x + 380, y: s.y - 20 }, null);
        return;
      }
      const p = posOf(parentId, { x: 0, y: 0 });
      const siblings = tree.branches.filter((b) => b.parent_node_id === parentId).length;
      draftNode({ x: p.x + 340, y: p.y + siblings * 170 }, { id: uid(), parent_node_id: parentId, child_node_id: "", name: "Connection", condition: "True" });
    },
    [tree, draftNode, posOf, readOnly],
  );

  // Canvas nodes: Start, the tree's nodes, an Extraction End after every leaf. Positions of
  // nodes already on the canvas are kept (so dragging is not undone by a re-render).
  useEffect(() => {
    setRfNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      const at = (id: string, key: string, fallback: XY) => byId.get(id)?.position ?? positions.current[key] ?? fallback;
      const startXY = positions.current[tree.starting_node_id ?? ""] ?? { x: 0, y: 0 };
      const parents = new Set(tree.branches.map((b) => b.parent_node_id));
      const selected = drawer?.isNew ? null : drawer?.node.id;
      const out: TreeFlowNode[] = [
        {
          id: START,
          type: "start",
          position: at(START, "start", { x: startXY.x - 380, y: startXY.y + 20 }),
          data: { label: "Start", onAddChild: () => addChild(START) },
        },
      ];
      for (const n of tree.nodes) {
        const xy = at(n.id, n.id, { x: 0, y: 0 });
        out.push({
          id: n.id,
          type: "tree",
          position: xy,
          selected: selected === n.id,
          data: { name: n.name, issues: issues(tree, n), onAddChild: () => addChild(n.id) },
        });
        if (!parents.has(n.id)) {
          out.push({
            id: endId(n.id),
            type: "end",
            position: at(endId(n.id), `end:${n.id}`, { x: xy.x + 260, y: xy.y + 20 }),
            data: { label: "Extraction End" },
            selectable: false,
          });
        }
      }
      return out;
    });
  }, [tree, drawer, addChild]);

  const edges: Edge[] = useMemo(() => {
    const out: Edge[] = [];
    const common = { type: "smoothstep", style: EDGE_STYLE, pathOptions: { borderRadius: 10 } };
    if (tree.starting_node_id) out.push({ id: "start-edge", source: START, sourceHandle: "b", target: tree.starting_node_id, targetHandle: "d", ...common });
    const used = new Set<string>();
    tree.branches.forEach((b, i) => {
      const plain = unconditional(b.condition);
      const handle = plain || !used.has(b.parent_node_id) ? "b" : "c";
      used.add(b.parent_node_id);
      const name = (b.name ?? "").trim();
      out.push({
        id: b.id ?? `b-${i}`,
        source: b.parent_node_id,
        sourceHandle: handle,
        target: b.child_node_id,
        targetHandle: "d",
        label: name && !(plain && name === "Connection") ? name : undefined,
        ...LABEL,
        ...common,
      });
    });
    const parents = new Set(tree.branches.map((b) => b.parent_node_id));
    tree.nodes.filter((n) => !parents.has(n.id)).forEach((n) => out.push({ id: `end-${n.id}`, source: n.id, sourceHandle: "b", target: endId(n.id), targetHandle: "d", ...common }));
    return out;
  }, [tree]);

  const onNodesChange = useCallback((changes: NodeChange<TreeFlowNode>[]) => {
    const relevant = changes.filter((c) => c.type !== "remove" && c.type !== "select");
    if (relevant.some((c) => c.type === "position" && c.dragging)) setMoved(true);
    setRfNodes((nds) => applyNodeChanges(relevant, nds) as TreeFlowNode[]);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (moved || drawerDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [moved, drawerDirty]);

  function layoutPayload(extra: Record<string, XY> = {}) {
    const out: Record<string, XY> = {};
    for (const n of rfNodes) {
      const key = n.id === START ? "start" : n.id.startsWith("__end:") ? `end:${n.id.slice(6)}` : n.id;
      out[key] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    }
    return { positions: { ...out, ...extra } };
  }

  async function persist(next: TreeGraph, extraPositions: Record<string, XY> = {}): Promise<boolean> {
    if (readOnly) return false;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const out = await dt.put<TreeGraph>(`/v1/trees/${next.id}`, {
        name: next.name,
        description: next.description,
        business_context: next.business_context,
        starting_node_id: next.starting_node_id,
        parameters: next.parameters,
        layout: layoutPayload(extraPositions),
        nodes: next.nodes,
        branches: next.branches.map((b) => ({ ...b, condition: b.condition ?? "" })),
      });
      positions.current = { ...positions.current, ...(out.layout?.positions ?? {}) };
      setTree(out);
      void mutate(`dt:/v1/trees/${out.id}`, out, false);
      setMoved(false);
      setNotice(`Saved version ${out.version}.`);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function update(d: DrawerState) {
    const names = new Set(tree.nodes.map((n) => n.name).concat(d.node.name));
    const created: NodeGraph[] = [];
    const extra: Record<string, XY> = {};
    const base = positions.current[d.node.id] ?? posOf(d.node.id, { x: 0, y: 0 });
    if (d.isNew) extra[d.node.id] = base;
    const outgoing = d.branches.map((b, i) => {
      if (b.child_node_id !== NEW_NODE) return b;
      const existingNodes = d.isNew ? [...tree.nodes, d.node, ...created] : [...tree.nodes, ...created];
      const n = newNode("gpt", { ...tree, nodes: existingNodes }, d.node.mlmodel_id ?? defaultModel);
      n.name = uniqueName(names);
      names.add(n.name);
      created.push(n);
      extra[n.id] = positions.current[n.id] = { x: base.x + 340, y: base.y + i * 170 };
      return { ...b, child_node_id: n.id };
    });
    const nodes = d.isNew ? [...tree.nodes, d.node] : tree.nodes.map((n) => (n.id === d.node.id ? d.node : n));
    const next: TreeGraph = {
      ...tree,
      nodes: [...nodes, ...created],
      branches: [...tree.branches.filter((b) => b.parent_node_id !== d.node.id), ...(d.incoming ? [d.incoming] : []), ...outgoing],
      starting_node_id: tree.starting_node_id ?? (d.isNew && !d.incoming ? d.node.id : null),
    };
    if (await persist(next, extra)) {
      setDrawer(null);
      setDrawerDirty(false);
    }
  }

  async function deleteNode(id: string) {
    const remainingNodes = tree.nodes.filter((n) => n.id !== id);
    const remainingBranches = tree.branches.filter((b) => b.parent_node_id !== id && b.child_node_id !== id);
    let nextStart = tree.starting_node_id;
    if (nextStart === id) {
      const childIds = new Set(remainingBranches.map((b) => b.child_node_id));
      const root = remainingNodes.find((n) => !childIds.has(n.id));
      nextStart = root?.id ?? remainingNodes[0]?.id ?? null;
    }
    const next: TreeGraph = {
      ...tree,
      nodes: remainingNodes,
      branches: remainingBranches,
      starting_node_id: nextStart,
    };
    if (await persist(next)) {
      setDrawer(null);
      setDrawerDirty(false);
    }
  }

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly) return;
      if (!c.source || !c.target || c.source === c.target || c.target === START || c.target.startsWith("__end:")) return;
      const target = tree.nodes.find((n) => n.id === c.target);
      if (c.source === START) {
        if (!target || tree.starting_node_id === c.target) return;
        if (!confirm(`Start extraction at ${target.name}?`)) return;
        persist({ ...tree, starting_node_id: c.target, branches: tree.branches.filter((b) => b.child_node_id !== c.target) });
        return;
      }
      if (tree.starting_node_id === c.target) {
        setNotice("The starting node cannot have an incoming branch.");
        return;
      }
      const parent = tree.branches.find((b) => b.child_node_id === c.target);
      if (parent) {
        setNotice(`${target?.name ?? "That node"} already has a parent. Each node has one incoming branch.`);
        return;
      }
      const plain = c.sourceHandle !== "c";
      openNode(c.source, "branches", {
        id: uid(),
        parent_node_id: c.source,
        child_node_id: c.target,
        name: plain ? "Connection" : "",
        condition: plain ? "True" : "",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, openNode],
  );

  const relayout = () => {
    const pos = autoLayout(tree.nodes, tree.branches, tree.starting_node_id);
    const start = pos[tree.starting_node_id ?? ""] ?? { x: 0, y: 0 };
    setRfNodes((nds) =>
      nds.map((n) => {
        if (n.id === START) return { ...n, position: { x: start.x - 380, y: start.y + 20 } };
        if (n.id.startsWith("__end:")) {
          const p = pos[n.id.slice(6)];
          return p ? { ...n, position: { x: p.x + 260, y: p.y + 20 } } : n;
        }
        return { ...n, position: pos[n.id] ?? n.position };
      }),
    );
    setMoved(true);
    setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 50);
  };

  const validate = async () => {
    setError(null);
    setNotice(null);
    try {
      const r = await dt.post<{ valid: boolean; errors: string[] }>("/v1/trees/validate", {
        ...tree,
        layout: layoutPayload(),
        branches: tree.branches.map((b) => ({ ...b, condition: b.condition ?? "" })),
      });
      if (r.valid) setNotice("The tree is valid.");
      else setError(new ApiError(422, "Validation failed", r.errors));
    } catch (e) {
      setError(e);
    }
  };

  const toolButton = "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-violet-700 hover:bg-violet-50 disabled:opacity-50";

  return (
    <div className="flex h-[calc(100vh-73px)] flex-col">
      <div className="flex min-h-[64px] flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-2">
        <Link href={backHref} className="text-[13px] text-slate-500 hover:text-slate-800">
          {backLabel}
        </Link>
        <span className="text-slate-300">/</span>
        <IconTree className="h-4 w-4 text-violet-600" />
        <span className="text-[15px] font-semibold text-slate-900">{tree.name}</span>
        <Badge>v{tree.version}</Badge>
        {readOnly && <Badge tone="slate">Read-only</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!readOnly && moved && (
            <button className={cx(toolButton, "bg-violet-600 text-white hover:bg-violet-700")} disabled={saving} onClick={() => persist(tree)}>
              Save layout
            </button>
          )}
          {!readOnly && (
            <button
              className={toolButton}
              onClick={() => {
                const c = rf.screenToFlowPosition({ x: window.innerWidth / 3, y: window.innerHeight / 2 });
                draftNode(c, null);
              }}
            >
              <IconPlus className="h-4 w-4" /> Add node
            </button>
          )}
          {!readOnly && (
            <button className={toolButton} onClick={relayout}>
              Auto-layout
            </button>
          )}
          {!readOnly && (
            <button className={toolButton} onClick={validate}>
              <IconCheck className="h-4 w-4" /> Validate
            </button>
          )}
          <button
            className={toolButton}
            onClick={() => {
              if (!confirmDiscard()) return;
              setDrawer(null);
              setDrawerDirty(false);
              setError(null);
              setSettingsOpen(true);
            }}
          >
            Settings
          </button>
        </div>
      </div>
      {((error && !drawer && !settingsOpen) || notice) && (
        <div className="space-y-2 border-b border-slate-200 bg-white px-5 py-2">
          {!drawer && !settingsOpen && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
          {notice && (
            <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
              {notice}
              <button className="text-xs" onClick={() => setNotice(null)}>
                dismiss
              </button>
            </div>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        <ReactFlow
          nodes={rfNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          connectOnClick={false}
          isValidConnection={(c) => !!c.target && c.target !== START && !c.target.startsWith("__end:") && c.source !== c.target}
          onNodeClick={(_, n) => n.type === "tree" && openNode(n.id)}
          onEdgeClick={(_, e) => {
            const b = tree.branches.find((x, i) => (x.id ?? `b-${i}`) === e.id);
            if (b) openNode(b.parent_node_id, "branches");
          }}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          defaultEdgeOptions={{ type: "smoothstep" }}
        >
          <Controls position="bottom-left" className="!shadow-[0_1px_4px_rgba(15,23,42,0.2)]" />
        </ReactFlow>
        {tree.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded bg-white/90 px-4 py-2 text-[15px] text-slate-600">
              Click the <b>+</b> on Start to add the first node.
            </p>
          </div>
        )}
        {drawer && (
          <NodeDrawer
            key={drawerKey}
            state={drawer}
            tree={tree}
            models={models}
            saving={saving}
            error={error}
            readOnly={readOnly}
            onDirtyChange={setDrawerDirty}
            onCancel={() => {
              setDrawer(null);
              setDrawerDirty(false);
              setError(null);
            }}
            onUpdate={update}
            onDelete={() => deleteNode(drawer.node.id)}
            onDismissError={() => setError(null)}
          />
        )}
        {settingsOpen && (
          <TreeSettingsDrawer
            tree={tree}
            saving={saving}
            error={error}
            readOnly={readOnly}
            onDirtyChange={setDrawerDirty}
            onCancel={() => {
              setSettingsOpen(false);
              setDrawerDirty(false);
              setError(null);
            }}
            onUpdate={async (s) => {
              if (await persist({ ...tree, ...s })) {
                setSettingsOpen(false);
                setDrawerDirty(false);
              }
            }}
            onDismissError={() => setError(null)}
          />
        )}
      </div>
    </div>
  );
}

export function TreeEditor(props: EditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
