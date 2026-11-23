"use client";

// Small building blocks for the work item screens.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/ui";
import { IconCheck, IconCopy, IconInfo, IconUser } from "@/components/icons";
import { STATUS_META, statusLabel } from "@/lib/workItems";

export function StatusDot({ status, detail }: { status: string; detail?: string | null }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={cx("h-[18px] w-[18px] shrink-0 rounded-full", meta?.dot ?? "bg-slate-300")} />
      <span className="text-slate-900">{statusLabel(status)}</span>
      {detail && <InfoTip text={detail} />}
    </span>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex">
      <IconInfo className="h-[18px] w-[18px] fill-blue-600 text-white" aria-label={text} />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-72 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`${label}: ${value}`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="rounded p-1 text-violet-700 hover:bg-violet-50"
    >
      {done ? <IconCheck className="h-5 w-5" /> : <IconCopy className="h-5 w-5" />}
    </button>
  );
}

export function Avatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7" : "h-10 w-10";
  return (
    <span className={cx("flex shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400", dim)}>
      <IconUser className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} strokeWidth={1.3} />
      <span className="sr-only">{name ?? "Unassigned"}</span>
    </span>
  );
}

/** A small popover anchored under its trigger (portaled so overflow-auto tables never clip it). */
export function Popover({
  trigger,
  children,
  align = "right",
  width = "w-64",
}: {
  trigger: (open: boolean, toggle: () => void) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelW = panelRef.current?.offsetWidth ?? 256;
      const panelH = panelRef.current?.offsetHeight ?? 0;
      let left = align === "right" ? rect.right - panelW : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
      let top = rect.bottom + 8;
      if (panelH && top + panelH > window.innerHeight - 8 && rect.top - panelH - 8 > 8) {
        top = rect.top - panelH - 8;
      }
      setPos({ top, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className="relative inline-flex">
      {trigger(open, () => setOpen((o) => !o))}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            className={cx(
              "fixed z-50 max-h-[80vh] overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-sm font-normal text-slate-800 shadow-xl",
              width,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PurpleButton({
  children,
  variant = "solid",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline" | "ghost" | "danger" }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "solid" && "bg-violet-600 text-white shadow-sm hover:bg-violet-700",
        variant === "outline" && "border border-violet-300 bg-white text-violet-700 hover:bg-violet-50",
        variant === "ghost" && "text-slate-700 hover:bg-slate-100",
        variant === "danger" && "border border-red-200 bg-white text-red-600 hover:bg-red-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
