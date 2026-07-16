import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";

/**
 * POST /api/bid-form/:token/submissions — PUBLIC (no auth). Proxies the agents public endpoint
 * `POST /public/bid-form/{token}/submissions` (off-platform supplier submits a bid). Forwards the
 * raw JSON body; unwraps the `{ data }` envelope. Surfaces the upstream status (404/422/429).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!serverEnv.agentsApiUrl) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const body = await req.text();
  try {
    const res = await fetch(`${serverEnv.agentsApiUrl}/public/bid-form/${encodeURIComponent(token)}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      // The agents backend returns `{ error: { message, messageAr, code } }`. Flatten it to the
      // `{ detail, messageAr, backendCode }` shape the web ApiError reads, so specific reasons (e.g. the
      // units-cap 400/409 "Offer between 1 and N units…") surface to the supplier instead of a generic fail.
      const be = json && typeof json === "object" && "error" in json ? (json as { error?: { message?: string; messageAr?: string; code?: string } }).error : null;
      return NextResponse.json(
        { ...(json && typeof json === "object" ? json : {}), detail: be?.message, messageAr: be?.messageAr, backendCode: be?.code },
        { status: res.status },
      );
    }
    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
