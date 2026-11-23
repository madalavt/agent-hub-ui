// ---------------------------------------------------------------- decision-tree API

export interface Customer {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  project_count: number;
}

/** A tenant's project (v1 roots-auth): work items and documents, with its own queue. */
export interface TenantProject {
  project_id: string;
  tenant_id: string;
  display_name: string;
  description: string | null;
  created_by: string | null;
  created_at: string | null;
  document_project_id: number | null;
  membersCount: number;
  queue_id: string | null;
}

/** A decision tree configuration (v1 igpt configuration): a tree plus the integer id
 * automations upload documents to. Stored as an Agent Hub "project" in the decision-tree API. */
export interface Project {
  id: string;
  customer_id: string;
  name: string;
  description: string | null;
  tree_id: string | null;
  tree_name: string | null;
  parameters: Record<string, unknown>;
  created_at: string;
}

export interface MlModel {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  standard: boolean;
}

export type FieldType = "string" | "number" | "currency" | "date" | "boolean" | "table";

export interface FieldGraph {
  id?: string | null;
  name: string;
  customer_key: string;
  description: string;
  field_type: FieldType;
  threshold: number;
  child_fields: FieldGraph[];
}

export interface PromptTemplate {
  system?: string;
  human?: string;
  ai?: string;
}

export interface NodeGraph {
  id: string;
  name: string;
  type: "gpt_node" | "code_node";
  description: string | null;
  mlmodel_id: string | null;
  parameters: { prompt_template?: PromptTemplate; function?: string; table_key?: string } & Record<
    string,
    unknown
  >;
  fields: FieldGraph[];
}

export interface BranchGraph {
  id?: string | null;
  parent_node_id: string;
  child_node_id: string;
  name: string | null;
  condition: string | null;
}

export interface TreeLayout {
  positions?: Record<string, { x: number; y: number }>;
}

export interface TreeGraph {
  id: string;
  customer_id?: string | null;
  name: string;
  description: string | null;
  business_context: string | null;
  starting_node_id: string | null;
  parameters: Record<string, unknown>;
  layout: TreeLayout;
  nodes: NodeGraph[];
  branches: BranchGraph[];
  version: number;
  created_at: string;
  updated_at: string;
  projects: { id: string; name: string; customer_id: string }[];
}

export interface TreeSummary {
  id: string;
  customer_id?: string | null;
  name: string;
  description: string | null;
  node_count: number;
  version: number;
  updated_at: string;
  projects: { id: string; name: string; customer_id: string }[];
}

export interface Meta {
  node_types: string[];
  code_functions: string[];
  field_types: FieldType[];
  prompt_placeholders: Record<string, string[]>;
  business_rules: string[];
  condition_examples: string[];
}

// ---------------------------------------------------------------- extraction API

export type DisplayStatus = "processing" | "completed" | "failed";

export interface DocumentSummary {
  document_id: number;
  doc_index: number;
  file_name: string;
  page_count: number;
  document_type: string | null;
  table_row_counts: Record<string, number>;
}

export interface Package {
  package_id: number;
  project_id: string;
  customer_id: string | null;
  file_name: string;
  file_size: number;
  status: "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";
  status_code: number;
  display_status: DisplayStatus;
  external_ref: string | null;
  attempts: number;
  error: string | null;
  tree_id: string | null;
  tree_name: string | null;
  tree_version: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  timings: Record<string, number> | null;
  documents: DocumentSummary[];
}

export interface ExtractedField {
  customer_key: string;
  name: string;
  type: FieldType;
  value: unknown;
  raw: unknown;
  error: string | null;
  node_id: string;
  node_name: string;
}

export interface Column {
  key: string;
  name: string;
  type: FieldType;
  description: string;
}

export interface TableRowOut {
  row_id: number;
  row_index: number;
  source_pages: [number | null, number | null];
  values: Record<string, unknown>;
  raw?: Record<string, unknown>;
  errors: Record<string, string>;
  corrections: Record<string, unknown>;
  warnings: string[];
}

export interface TableOut {
  customer_key: string;
  name: string;
  node_name: string | null;
  columns: Column[];
  rows: TableRowOut[];
}

export interface Finding {
  node: string;
  table_key: string;
  row_index: number;
  violations: { rule: string; type: string; field: string; detail: string }[];
  outputs: Record<string, unknown>;
  applied_actions: { field: string; from: unknown; to: unknown }[];
  llm_status: string;
  error: string | null;
}

export interface DocumentResult {
  document_id: number;
  doc_index: number;
  file_name: string;
  page_count: number;
  document_type: string | null;
  path: string[];
  fields: ExtractedField[];
  tables: TableOut[];
  findings: Finding[];
}

export interface PackageResults extends Package {
  results: DocumentResult[];
}

export interface Step {
  attempt: number;
  document_index: number | null;
  node_id: string | null;
  node: string;
  status: "ok" | "error" | "skipped";
  started_at: string | null;
  duration_s: number;
  model: string | null;
  llm_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  detail: string | null;
  error: string | null;
}

export interface ProjectStats {
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

export interface CredentialsStatus {
  providers?: Record<string, { type: string; configured: boolean }>;
  model_types?: Record<string, string | null>;
  defaults?: { provider: string; model: string }[];
  ocr?: string;
  error?: string;
}

// ---------------------------------------------------------------- igpt (v1 shapes)

/** A v1 "configuration": an Agent Hub project with its decision tree. */
export interface IgptConfigurationSummary {
  id: string;
  name: string;
  description: string;
  tree_id: string | null;
  enable_pss: boolean;
  doc_processing_project_id: string;
}

/** GET /api/roots-igpt/customer/{id} */
export interface IgptCustomer {
  customer: { id: string; name: string; configurations: IgptConfigurationSummary[] };
}

/** GET /api/roots-igpt/configuration/{id} */
export interface IgptConfiguration {
  configuration: IgptConfigurationSummary & { tree: { id: string; name: string } | null };
}

