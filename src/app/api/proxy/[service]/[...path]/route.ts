import type { NextRequest } from "next/server";
import { forward, isService } from "@/lib/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(req: NextRequest, ctx: { params: Promise<{ service: string; path: string[] }> }) {
  const { service, path } = await ctx.params;
  if (!isService(service)) return Response.json({ detail: `unknown service ${service}` }, { status: 404 });
  return forward(req, service, path);
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
