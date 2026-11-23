"use client";

// Canvas nodes, like v1's decision tree: a Start pill, node cards (name over a body that turns
// lavender when selected) and an Extraction End pill after every leaf. Handles use v1's ids:
// "b" right (first / unconditional branch, also "+" to add a child), "c" bottom (further
// conditional branches), "d" left (incoming).

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { cx } from "../ui";

export type TreeNodeData = {
  name: string;
  issues: string[];
  onAddChild?: () => void;
};
export type PillData = { label: string; onAddChild?: () => void };

export type TreeFlowNode = Node<TreeNodeData, "tree"> | Node<PillData, "start"> | Node<PillData, "end">;

const handleBase = "!flex !items-center !justify-center !rounded-full !border !border-slate-400 !bg-white !text-slate-500";

function PlusHandle({ id, position, onAdd, style }: { id: string; position: Position; onAdd?: () => void; style?: React.CSSProperties }) {
  return (
    <Handle
      type="source"
      id={id}
      position={position}
      style={style}
      className={cx(handleBase, "!h-4 !w-4 hover:!border-violet-600 hover:!text-violet-700")}
      title="Drag to connect · click to add a child node"
      onClick={(e) => {
        e.stopPropagation();
        onAdd?.();
      }}
    >
      <svg viewBox="0 0 12 12" className="pointer-events-none h-2.5 w-2.5" stroke="currentColor" strokeWidth={1.4} fill="none" aria-hidden>
        <path d="M6 2v8M2 6h8" />
      </svg>
    </Handle>
  );
}

function TreeNodeImpl({ data, selected }: NodeProps<Node<TreeNodeData, "tree">>) {
  return (
    <div
      className={cx(
        "w-[150px] rounded-[3px] border border-slate-200 border-t-[3px] border-t-violet-600 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.18)]",
        selected && "border-violet-300",
      )}
      title={data.issues.length ? data.issues.join("\n") : undefined}
    >
      <Handle type="target" id="d" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <div className="flex items-start gap-1 bg-white px-3 py-2 text-[13px] leading-snug text-slate-800">
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{data.name}</span>
        {data.issues.length > 0 && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label={`${data.issues.length} issue(s)`} />}
      </div>
      <div className={cx("h-11 transition-colors", selected ? "bg-violet-200/80" : "bg-white")} />
      <PlusHandle id="b" position={Position.Right} onAdd={data.onAddChild} style={{ top: 44 }} />
      <Handle type="source" id="c" position={Position.Bottom} className={cx(handleBase, "!h-4 !w-4 hover:!border-violet-600")} title="Drag to add a conditional branch">
        <svg viewBox="0 0 12 12" className="pointer-events-none h-2.5 w-2.5" stroke="currentColor" strokeWidth={1.3} fill="none" aria-hidden>
          <path d="M4 2v8M4 6c3 0 4-1 4-4M8 2l-1.5 1.5M8 2l1.5 1.5" />
        </svg>
      </Handle>
    </div>
  );
}

function StartImpl({ data }: NodeProps<Node<PillData, "start">>) {
  return (
    <div className="flex h-11 w-[110px] items-center gap-2 rounded-[3px] bg-white px-2.5 text-[13px] text-slate-800 shadow-[0_2px_6px_rgba(15,23,42,0.18)]">
      <svg viewBox="0 0 20 20" className="h-5 w-5 text-slate-700" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
        <path d="M3 4.5h9.5L17 10l-4.5 5.5H3z" />
      </svg>
      {data.label}
      <PlusHandle id="b" position={Position.Right} onAdd={data.onAddChild} />
    </div>
  );
}

function EndImpl({ data }: NodeProps<Node<PillData, "end">>) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-[3px] bg-white px-3 text-[13px] text-slate-800 shadow-[0_2px_6px_rgba(15,23,42,0.18)]">
      <Handle type="target" id="d" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-transparent" isConnectable={false} />
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
        <rect x="4" y="4" width="12" height="12" rx="1.5" />
      </svg>
      {data.label}
    </div>
  );
}

export const TreeNodeCard = memo(TreeNodeImpl);
export const StartNode = memo(StartImpl);
export const EndNode = memo(EndImpl);
