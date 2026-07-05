import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";

/**
 * GET /api/bid-form/:token — PUBLIC (no auth). Proxies the agents public endpoint
 * `GET /public/bid-form/{token}` so the supplier bid form can render the request's items + terms.
 * No service token (the agents route is public). Unwraps the `{ data }` envelope.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!serverEnv.agentsApiUrl) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const res = await fetch(`${serverEnv.agentsApiUrl}/public/bid-form/${encodeURIComponent(token)}`, { cache: "no-store" });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) return NextResponse.json(json ?? { error: "not_found" }, { status: res.status });
    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
