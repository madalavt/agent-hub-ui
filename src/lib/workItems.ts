// Work Item Manager + Annotations API types and display helpers.

export const WI_STATUSES = [
  "queued",
  "in_progress",
  "deferred",
  "requires_review",
  "automated",
  "system_exception",
  "manually_closed",
] as const;
export type WiStatus = (typeof WI_STATUSES)[number];

export const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  queued: { label: "Queued", dot: "bg-sky-500", text: "text-sky-700" },
  in_progress: { label: "In Progress", dot: "bg-blue-600", text: "text-blue-700" },
  requires_review: { label: "Requires Review", dot: "bg-red-500", text: "text-red-700" },
  automated: { label: "Automated", dot: "bg-green-500", text: "text-green-700" },
  system_exception: { label: "System Exception", dot: "bg-orange-500", text: "text-orange-700" },
  retrying: { label: "Retrying", dot: "bg-amber-400", text: "text-amber-700" },
  deferred: { label: "Deferred", dot: "bg-violet-500", text: "text-violet-700" },
  manually_closed: { label: "Manually Closed", dot: "bg-slate-400", text: "text-slate-600" },
  completed: { label: "Completed", dot: "bg-emerald-600", text: "text-emerald-700" },
};

export const statusLabel = (s: string) => STATUS_META[s]?.label ?? s;

export interface Queue {
  id: string;
  name: string;
  maxAttempts?: number;
  rootsId?: string | null;
  organization?: string | null;
  description?: string | null;
  projectId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  counts?: Record<string, number>;
}

export interface WiUser {
  id: string;
  name: string;
  email?: string | null;
}

export interface V2Row {
  display_roots_id: string | null;
  trace_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  assignee_id: string | null;
  assignee_name: string | null;
  incremented_display_id: number;
  package_details: { package_id: number; file_id: string; file_name: string }[];
  exception_details: string | null;
  exception_type: string | null;
  file_count: number;
  locked: boolean;
  locking_resource: string | null;
  priority: number;
  attempts: number;
  tags: string[];
  queue_id: string;
}

export interface V2Response {
  rows: V2Row[];
  columns: { id: number; field: string; headerName: string }[];
  metadata: { total_item_count: number; statuses: Record<string, number> };
  lastRow: number;
}

export interface ItemInfo {
  id: string;
  incrementedDisplayId: number;
  createdAt: string;
  updatedAt: string;
  assigneeId: string | null;
  assignedBy: string | null;
  priority: number;
  status: string;
  previousStatus: string | null;
  locked: boolean;
  lockingResource: string | null;
  lastLockedAt: string | null;
  attempts: number;
  deferCount: number;
  nextReviewDate: string | null;
  completedAt: string | null;
  workTimeSeconds: number;
  exceptionDate: string | null;
  exceptionReason: string | null;
  lastExceptionType: string | null;
  data: Record<string, unknown>;
  reportingJson: Record<string, unknown> | string | null;
  formSearchText: string;
  notes: string;
  displayRootsId: string | null;
  rootsId: string | null;
  lastUpdatedBy: string | null;
  queue: string;
  tags: string[];
}

export interface ItemFile {
  id: string;
  fileName: string;
  filePath: string;
  packageId: number | null;
  createdAt: string;
}

export interface ItemEvent {
  id: number;
  at: string;
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: string | null;
  message: string | null;
}

export interface DocRow extends ItemFile {
  trace_id: string;
  incremented_display_id: number;
  display_roots_id: string | null;
  item_status: string;
  queue_id: string;
}

// ------------------------------------------------------------------ annotations

/** Platform package status codes (what projects poll). */
export const PACKAGE_STATUS: Record<number, { label: string; tone: string }> = {
  0: { label: "Holding", tone: "bg-slate-100 text-slate-700" },
  1: { label: "Uploaded", tone: "bg-slate-100 text-slate-700" },
  2: { label: "Processed", tone: "bg-sky-50 text-sky-700" },
  3: { label: "Needs scoring", tone: "bg-red-50 text-red-700" },
  4: { label: "Scoring in progress", tone: "bg-amber-50 text-amber-700" },
  5: { label: "QA", tone: "bg-violet-50 text-violet-700" },
  6: { label: "QA in progress", tone: "bg-amber-50 text-amber-700" },
  7: { label: "Completed", tone: "bg-green-50 text-green-700" },
  8: { label: "Processing", tone: "bg-amber-50 text-amber-700" },
  99: { label: "Failed", tone: "bg-red-50 text-red-700" },
};

export interface LinkedPackage {
  packageId: number;
  package_id: number;
  fileName: string;
  file_name: string;
  status: number;
  package_status?: number;
  status_name?: string;
  display_status?: string;
  annotation_status?: string;
  project_id?: string;
  customer_id?: string | null;
  workItemId?: string | null;
  document_count?: number;
  /** The package's documents; each one's PDF is at /{package}/documents/{id}/pdf. */
  documents?: { id: number; file_name: string }[];
  document_types?: string[];
  page_count?: number;
  createdAt?: string;
  updatedAt?: string;
  submitted_by?: string | null;
  submitted_at?: string | null;
}

export interface EditDetails {
  modified_by?: { email?: string; name?: string } | string | null;
  modified_on?: string | null;
}

/** A field as it is now (v1 ``modified_data``: edits applied). */
export interface AnnField {
  id: number;
  ml_field_id: string | null;
  document_id: number;
  name: string;
  customer_key: string;
  field_type: string;
  value: unknown;
  ml_confidence_score: number | null;
  model_score?: number | null;
  is_grid_field: boolean;
  igpt_object_id?: string | null;
  table_id: number | null;
  row_count?: number | null;
  comment: string | null;
  error?: string | null;
  is_modified?: boolean;
  page_number?: number | null;
  created_on?: string | null;
  created_by?: string | null;
  last_modified_on?: string | null;
  last_modified_by?: string | null;
}

/** A field as extracted (v1 ``extracted_data``: never changes). */
export interface AnnExtractedField {
  id: number;
  ml_field_id: string | null;
  name: string;
  customer_key: string;
  field_type: string;
  value: unknown;
  modified_on?: string | null;
  modified_by?: string | null;
  version?: number;
}

export interface AnnTable {
  id: number;
  customer_key: string;
  name: string;
  node_name?: string | null;
  row_count: number;
  columns: { key: string; name?: string; type?: string }[];
}

export interface AnnSubDocument {
  id: number;
  doc_index?: number;
  extraction_end_name: string | null;
  document_type: string | null;
  /** Decision-tree node the document ended on (v1: igpt_object_id). */
  leaf_node_id?: string | null;
  file_name: string;
  page_count: number;
  status?: number;
  extracted_data: AnnExtractedField[];
  modified_data: AnnField[];
  tables: AnnTable[];
  pages: { id: number; page_number: number; image_url?: string }[];
}

export interface AnnDetails {
  read_only_mode: boolean;
  /** What the next submit does (v1): 5 QA, 7 Completed; null when nothing can be submitted. */
  package_next_status_id: number | null;
  package_next_status: string | null;
  package_id: number;
  package_status: number;
  status_name?: string;
  package_name: string;
  project_id: string;
  project_name: string | null;
  file_name: string;
  work_item_id: string | null;
  annotation_status: string;
  confident?: boolean | null;
  submitted_at?: string | null;
  submitted_by?: string | null;
  error?: string | null;
  sub_documents: AnnSubDocument[];
}

export interface PageImage {
  page_id: number;
  id?: number;
  page_number: number;
  width?: number;
  height?: number;
  url?: string;
}

export interface Cell {
  value: unknown;
  score?: number | null;
  model_score?: number | null;
  error?: string | null;
  original_value?: unknown;
}

export interface AnnTableData {
  metadata: { totalRowCount: number; readOnly?: boolean; tableName?: string };
  rows: ({ id: number; row_index?: number } & Record<string, unknown>)[];
  columns?: { key: string; name?: string; type?: string }[];
}

export function cellValue(v: unknown): unknown {
  return v && typeof v === "object" && "value" in (v as object) ? (v as Cell).value : v;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

export function shortTrace(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

export function display(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Status changes a person may make on an unlocked item (the work item API's manual
 * transitions). Bots change status only while they hold the lock.
 */
export const MANUAL_TRANSITIONS: Record<string, string[]> = {
  requires_review: ["queued", "manually_closed"],
  system_exception: ["manually_closed"],
  deferred: ["queued", "manually_closed"],
  queued: ["manually_closed"],
  retrying: ["queued", "manually_closed"],
};

export function manualTargets(status: string | undefined, locked: boolean | undefined): string[] {
  return !status || locked ? [] : (MANUAL_TRANSITIONS[status] ?? []);
}

export const MANUAL_LABEL: Record<string, string> = {
  queued: "Reprocess: hand back to the bot",
  manually_closed: "Manually Closed",
};

/** GET /api/roots-igpt/node/{id}/display-template (decision tree API /v1/nodes/{id}/display-template). */
export interface DisplayTemplate {
  node: {
    id: string;
    name: string;
    type: string;
    display_template: {
      id: string;
      template: {
        title: string;
        properties: Record<
          string,
          { type: string; order: number; title: string; customer_key: string; display_type: string; child_fields: unknown[] }
        >;
      };
    };
  };
}

