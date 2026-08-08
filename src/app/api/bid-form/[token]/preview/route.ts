import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";

/**
 * GET /api/bid-form/:token/preview — PUBLIC (no auth). Proxies the agents endpoint
 * `GET /public/bid-form/{token}/preview` so the browser can read the link-preview copy.
 *
 * The proxy exists because `AGENTS_API_URL` is server-only (see `lib/config/env.ts`) — the share
 * sheet runs in the browser and has no way to reach the agents API directly. Mirrors the sibling
 * `/api/bid-form/[token]` route, which does the same for the form itself.
 *
 * Used by the share sheet's Copy button to build the rich-text card that Gmail renders on paste.
 * Unwraps the `{ data }` envelope, like its sibling.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!serverEnv.agentsApiUrl) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const res = await fetch(
      `${serverEnv.agentsApiUrl}/public/bid-form/${encodeURIComponent(token)}/preview`,
      // Matches the endpoint's own Cache-Control: a newly set deadline shows up quickly, and
      // repeatedly opening the sheet doesn't hit the database each time.
      { next: { revalidate: 300 } },
    );
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) return NextResponse.json(json ?? { error: "not_found" }, { status: res.status });
    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
