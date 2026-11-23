import { gatewayRoute } from "@/lib/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// v1 /api/roots-igpt/... → decision-tree API:
//   node/{id}[/display-template]      → /v1/nodes/{id}[/display-template]
//   customer/{id}                     → /v1/igpt/customers/{id}
//   configuration/{id}                → /v1/igpt/configurations/{id}
//   mlmodels | field-default-template → /v1/igpt/...
//   project-field-library/{projectId} → /v1/igpt/project-field-library/{projectId}
const PLURAL: Record<string, string> = { customer: "customers", configuration: "configurations" };

function toDecisionTree(path: string[]): string[] {
  const [head, ...rest] = path;
  if (head === "node") return ["v1", "nodes", ...rest];
  return ["v1", "igpt", PLURAL[head] ?? head, ...rest];
}

export const { GET, POST, PUT, PATCH, DELETE } = gatewayRoute("dt", toDecisionTree);
