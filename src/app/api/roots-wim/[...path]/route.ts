import { gatewayRoute } from "@/lib/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET, POST, PUT, PATCH, DELETE } = gatewayRoute("wi");
