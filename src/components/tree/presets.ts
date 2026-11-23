import type { BranchGraph, FieldGraph, NodeGraph, TreeGraph } from "@/lib/types";

export type NodeKind = "gpt" | "table" | "verify_table" | "verify_business";

export const KIND_META: Record<NodeKind, { label: string; description: string; color: string; ring: string }> = {
  gpt: {
    label: "Field extraction",
    description: "Prompt → JSON object of fields (e.g. Document Type).",
    color: "bg-indigo-600",
    ring: "ring-indigo-300",
  },
  table: {
    label: "Table extraction",
    description: "Prompt → table rows, chunked by pages (tables.chunking.process).",
    color: "bg-sky-600",
    ring: "ring-sky-300",
  },
  verify_table: {
    label: "Table verifier",
    description: "Checks a table for missed / extra rows (verifiers.verify_table.process).",
    color: "bg-violet-600",
    ring: "ring-violet-300",
  },
  verify_business: {
    label: "Business rule verifier",
    description: "Domain rules on table rows + LLM review (verifiers.verify_business.process).",
    color: "bg-amber-600",
    ring: "ring-amber-300",
  },
};

export function kindOf(node: NodeGraph): NodeKind {
  switch (node.parameters?.function) {
    case "tables.chunking.process":
      return "table";
    case "verifiers.verify_table.process":
      return "verify_table";
    case "verifiers.verify_business.process":
      return "verify_business";
    default:
      return "gpt";
  }
}

/** Page chunking, like v1: only the tables.chunking.process code node chunks, with these keys. */
export const DEFAULT_CHUNK_PARAMS = { pdf_size_to_chunk: 100, pdf_chunk_size: 20 };

/** Code node functions the extraction engine runs (v1 names). */
export const CODE_FUNCTIONS: { name: string; help: string }[] = [
  {
    name: "tables.chunking.process",
    help: "Table rows. chunk_params: documents longer than pdf_size_to_chunk pages are sent in chunks of pdf_chunk_size pages.",
  },
  { name: "verifiers.verify_table.process", help: "Checks the table in table_key for missed or extra rows." },
  { name: "verifiers.verify_business.process", help: "Domain rules on the rows of table_key, then an LLM review." },
];

export const PLACEHOLDERS: Record<NodeKind, { key: string; help: string }[]> = {
  gpt: [
    { key: "{text}", help: "document text, page by page" },
    { key: "{extraction_fields}", help: "this node's fields as a JSON template" },
  ],
  table: [
    { key: "{text}", help: "document (or chunk) text" },
    { key: "{extraction_fields}", help: "table columns, one per line" },
  ],
  verify_table: [
    { key: "{text}", help: "document text" },
    { key: "{annot}", help: "the extracted table as a list of lists" },
    { key: "{n_rows}", help: "number of extracted rows" },
    { key: "{extraction_fields}", help: "this node's verdict fields" },
  ],
  verify_business: [
    { key: "{text}", help: "document text" },
    { key: "{relevant_rows}", help: "the flagged row" },
    { key: "{violations}", help: "rule violations for that row" },
    { key: "{extraction_fields}", help: "this node's output fields" },
  ],
};

export const BUSINESS_RULES = [
  "check_paid_components",
  "check_loss_paid",
  "check_reserve_components",
  "check_total_incurred",
  "check_date_order",
  "check_financial_totals",
];

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

export const field = (name: string, key: string, type: FieldGraph["field_type"] = "string", description = ""): FieldGraph => ({
  name,
  customer_key: key,
  description,
  field_type: type,
  threshold: 0.5,
  child_fields: [],
});

function uniqueName(tree: TreeGraph, base: string) {
  const names = new Set(tree.nodes.map((n) => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function allKeys(tree: TreeGraph): Set<string> {
  const keys = new Set<string>();
  tree.nodes.forEach((n) => n.fields.forEach((f) => keys.add(f.customer_key)));
  return keys;
}

function uniqueKey(tree: TreeGraph, base: string) {
  const keys = allKeys(tree);
  if (!keys.has(base)) return base;
  let i = 2;
  while (keys.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function tableKeys(tree: TreeGraph): { key: string; name: string }[] {
  return tree.nodes.flatMap((n) => n.fields.filter((f) => f.field_type === "table").map((f) => ({ key: f.customer_key, name: f.name })));
}

export function newNode(kind: NodeKind, tree: TreeGraph, mlmodelId: string | null): NodeGraph {
  const firstTable = tableKeys(tree)[0]?.key ?? "";
  switch (kind) {
    case "gpt":
      return {
        id: uid(),
        name: uniqueName(tree, "Field Extraction"),
        type: "gpt_node",
        description: null,
        mlmodel_id: mlmodelId,
        parameters: {
          prompt_template: {
            system:
              "You are an insurance document specialist. Read the document and extract the fields below.\n\nThe desired output should be a valid JSON format with the following keys:\n\n{extraction_fields}\n\nDo not give any explanation. Just return a valid json",
            human: "Here is the document:\n\n{text}",
            ai: "{output}",
          },
        },
        fields: [field("New Field", uniqueKey(tree, "new_field"))],
      };
    case "table": {
      const key = uniqueKey(tree, "new_table");
      const table = field("New Table", key, "table", "Rows extracted from the document");
      table.child_fields = [field("Column 1", "column_1", "string", "")];
      return {
        id: uid(),
        name: uniqueName(tree, "Table Extraction"),
        type: "code_node",
        description: null,
        mlmodel_id: mlmodelId,
        parameters: {
          function: "tables.chunking.process",
          chunk_params: { ...DEFAULT_CHUNK_PARAMS },
          prompt_format: "list",
          prompt_template: {
            system:
              "Extract one row per item from the document.\n\nOutput Format:\n- Return a valid JSON array of arrays. The first sub-array is the column headers, in the order below.\n- Each following sub-array holds the values for one row.\n- Use \"\" for missing values. Return [] if there are no rows.\n\nExtraction Fields:\n{extraction_fields}",
            human: "Here is the text of the document:\n< Document >\n{text}\n</ Document >",
            ai: "{output}",
          },
        },
        fields: [table],
      };
    }
    case "verify_table":
      return {
        id: uid(),
        name: uniqueName(tree, "Table Verifier"),
        type: "code_node",
        description: null,
        mlmodel_id: mlmodelId,
        parameters: {
          function: "verifiers.verify_table.process",
          table_key: firstTable,
          prompt_template: {
            system:
              "You are a data validation expert. Determine whether the annotation of the document has exactly one row per item, with no missed or extra rows. The annotation has {n_rows} rows.\n\nReturn a valid JSON object with:\n\n{extraction_fields}",
            human: "Here is the document:\n< Document >\n{text}\n</ Document >\nHere is the annotation:\n< Annotation >\n{annot}\n</ Annotation >",
            ai: "{output}",
          },
        },
        fields: [
          field("is_correct", uniqueKey(tree, "is_correct"), "string", 'Yes or No: is the annotation correct and complete?'),
          field("reason", uniqueKey(tree, "reason"), "string", "A short explanation."),
        ],
      };
    case "verify_business":
      return {
        id: uid(),
        name: uniqueName(tree, "Business Verifier"),
        type: "code_node",
        description: null,
        mlmodel_id: mlmodelId,
        parameters: {
          function: "verifiers.verify_business.process",
          table_key: firstTable,
          domain_rules: [...BUSINESS_RULES],
          prompt_template: {
            system:
              "You are an insurance data validation expert. Automated domain rules flagged these potential violations:\n\n{violations}\n\nDecide whether each is a genuine extraction error or an acceptable anomaly, then return a valid JSON object with:\n\n{extraction_fields}",
            human: "Here is the document:\n< Document >\n{text}\n</ Document >\n\nFlagged rows:\n{relevant_rows}",
            ai: "{output}",
          },
        },
        fields: [
          field("corrective_actions", uniqueKey(tree, "corrective_actions"), "string", "JSON list of {field, corrected_value}."),
          field("found_error", uniqueKey(tree, "found_error"), "string", "Yes/No: was a genuine error found?"),
          field("domain_reasoning", uniqueKey(tree, "domain_reasoning"), "string", "2-3 sentence explanation."),
        ],
      };
  }
}

/** Left-to-right tree layout (like v1's canvas): depth sets x; every subtree gets its own band of
 * rows, a parent sits level with its first child, so branch lines never cross. Unreachable nodes
 * go in a column after the deepest level. */
export function autoLayout(nodes: NodeGraph[], branches: BranchGraph[], start: string | null) {
  const ids = new Set(nodes.map((n) => n.id));
  const children = new Map<string, string[]>();
  branches.forEach((b) => {
    if (ids.has(b.parent_node_id) && ids.has(b.child_node_id))
      children.set(b.parent_node_id, [...(children.get(b.parent_node_id) ?? []), b.child_node_id]);
  });
  const positions: Record<string, { x: number; y: number }> = {};
  const X = 340;
  const Y = 150;
  let row = 0;
  let deepest = 0;
  const place = (id: string, depth: number) => {
    if (positions[id]) return;
    deepest = Math.max(deepest, depth);
    positions[id] = { x: depth * X, y: row * Y };
    const kids = (children.get(id) ?? []).filter((c) => !positions[c]);
    if (!kids.length) row++;
    kids.forEach((c) => place(c, depth + 1));
  };
  if (start && ids.has(start)) place(start, 0);
  const rest = nodes.filter((n) => !positions[n.id]);
  rest.forEach((n, i) => (positions[n.id] = { x: (deepest + 1) * X, y: i * Y }));
  return positions;
}
