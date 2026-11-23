import { gatewayRoute } from "@/lib/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// v1 /api/roots-auth/tenant/{tenant}/... (users, roles, permissions, projects)
//   → decision-tree API /v1/tenant/{tenant}/...
export const { GET, POST, PUT, PATCH, DELETE } = gatewayRoute("dt", (path) => ["v1", ...path]);
