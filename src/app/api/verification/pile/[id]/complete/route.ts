import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse, AppAuthError } from "@/lib/api/app-backend-authed";

/**
 * POST /api/verification/pile/{id}/complete — echo the keys that uploaded, closing the pile.
 *
 * Proxies backend `POST /suppliers/me/relay-submissions/{id}/complete` with `{ files: [{ key, name
 * }] }`. Only after this does the submission appear in RelayPanel's ledger as `received`.
 *
 * ⚠️ **409 is success, not an error.** If the response to a completed submission is lost, the client
 * retries and Relay answers 409 "already received". Surfacing that as a failure would tell a renter
 * whose documents ARE on file that nothing was sent, and invite a duplicate pile. The mobile app
 * makes the same allowance (`supplier_store_repository_impl.dart`), and the client helper tolerates it
 * too — this is the belt to that braces, so a future caller cannot get it wrong.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  const files = Array.isArray(body.files) ? body.files : [];

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ ok?: boolean; fileCount?: number }>(
        `/suppliers/me/relay-submissions/${encodeURIComponent(id)}/complete`,
        { method: "POST", body: JSON.stringify({ files }) },
      );
      return NextResponse.json({ ok: true, fileCount: data.fileCount ?? files.length });
    } catch (err) {
      if (err instanceof AppAuthError && err.status === 409) {
        return NextResponse.json({ ok: true, alreadyReceived: true });
      }
      return appAuthErrorResponse(err);
    }
  });
}
