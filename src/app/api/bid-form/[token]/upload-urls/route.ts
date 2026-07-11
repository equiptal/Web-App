import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";

/**
 * POST /api/bid-form/:token/upload-urls — PUBLIC (no auth). Proxies the agents public endpoint
 * `POST /public/bid-form/{token}/upload-urls` → presigned PUT URLs for the equipment photos /
 * documents the supplier attaches to a bid. Forwards the raw JSON body; unwraps the `{ data }`
 * envelope. Surfaces the upstream status (404/409/422).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!serverEnv.agentsApiUrl) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const body = await req.text();
  try {
    const res = await fetch(`${serverEnv.agentsApiUrl}/public/bid-form/${encodeURIComponent(token)}/upload-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) return NextResponse.json(json ?? { error: "upload_urls_failed" }, { status: res.status });
    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
