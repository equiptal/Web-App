import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * GET /api/me/bids/:id/documents — the bid's equipment documents as PRESIGNED URLs, so the comparison
 * can view certs / ownership files WITHOUT a deal room. Proxies `GET /marketplace/bids/{bidId}`
 * (getBidDetail), which signs `equipment.documentKeys` into `{ type, url }` entries. Company docs
 * (CR/VAT/national) aren't signed here — those still come from the deal-room documents endpoint.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = (await call(`/marketplace/bids/${encodeURIComponent(id)}`)) as Record<string, unknown>;
      const eq = (raw?.equipment ?? {}) as Record<string, unknown>;
      // `toSignedStructured` returns each entry as `{ type, key: <presigned-url> }` — the signed URL
      // lives under `key`, not `url`. Normalize to `{ type, url }` so the comparison's viewer can read it.
      const list = Array.isArray(eq.documentKeys) ? (eq.documentKeys as unknown[]) : [];
      const docs = list
        .map((d) => {
          const o = (d ?? {}) as Record<string, unknown>;
          const url = typeof o.url === "string" ? o.url : typeof o.key === "string" ? o.key : null;
          return { type: typeof o.type === "string" ? o.type : undefined, url };
        })
        .filter((d) => !!d.url);
      return NextResponse.json({ documents: docs });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
