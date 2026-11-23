import type { NextRequest } from "next/server";
import { forward } from "@/lib/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// v1 POST /api/roots-queue/docs/searches {queueId, project_id, tenant_id, startRow, endRow}: the
// documents of the project's queue, served like v1 by the work item manager (roots-queue). It
// finds the packages linked to the queue's items; the Annotations API adds review status and
// each package's tree configuration.
export async function POST(req: NextRequest) {
  return forward(req, "wi", ["docs", "searches"]);
}
