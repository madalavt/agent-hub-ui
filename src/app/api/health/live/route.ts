// UI liveness (used by the container healthcheck). No dependency checks.
import { uiLiveness } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(uiLiveness(), { headers: { "Cache-Control": "no-store" } });
}
