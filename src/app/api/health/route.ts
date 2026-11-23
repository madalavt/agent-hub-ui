// Whole-application health: UI + decision-tree API + extraction (database, storage, workers,
// queue, credentials; ?deep=true also probes LLM providers). 503 when anything is down.
import type { NextRequest } from "next/server";
import { appHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const body = await appHealth(req.nextUrl.searchParams.get("deep") === "true");
  return Response.json(body, { status: body.status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
