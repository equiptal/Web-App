import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/verification/pile/presign — open a company-documents pile and get presigned PUTs.
 *
 * Proxies backend `POST /suppliers/me/relay-submissions/presign` → `{ submissionId, uploads:
 * [{ fileName, key, mode, url }] }`, one upload per declared file, in order. The client PUTs each
 * file straight to its URL and then calls `.../{id}/complete` with the keys.
 *
 * ⚠️ **`source` and `docLane` are pinned here, never read from the body.** `source` is a claim about
 * WHO is calling, so a browser must not be able to make it — the same rule
 * `apps/backend/src/handlers/partner/submissions.ts` applies to Supplier OS. `docLane` is a statement
 * about WHAT is being uploaded, and for this route there is exactly one honest answer.
 *
 * ⚠️ **Why `docLane: "company"` and a non-`mobile*` source.** Relay resolves the pair into the row's
 * own source: a company lane from a non-mobile caller becomes `company-webapp`, which
 * `relayQueue.processSubmission` hands straight to `runCompanyPresort` — the pile is read by the
 * company classifier on arrival, with no operator having to press anything. Sending the lane with a
 * mobile source (or with no source, which defaults to `mobile`) would resolve to `company-mobile`
 * instead and file a browser upload as a phone one.
 *
 * The alternative lane — mobile's `source: "mobile_company_submission"` with no `docLane`, which
 * lands as an equipment-shaped row tagged `metadata.origin: "COMPANY_DOCS"` and waits for an
 * operator's "Run company check" — needs Relay changes to accept a web source and gains nothing.
 * See docs/implementation-plans/company-docs-pile-web/tickets.md §0.
 */
const PILE_SOURCE = "web_company_submission";
const PILE_DOC_LANE = "company";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  const files = Array.isArray(body.files) ? body.files : [];

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ submissionId?: string; uploads?: unknown[] }>(
        "/suppliers/me/relay-submissions/presign",
        {
          method: "POST",
          body: JSON.stringify({ files, source: PILE_SOURCE, docLane: PILE_DOC_LANE }),
        },
      );
      return NextResponse.json({
        submissionId: data.submissionId ?? null,
        uploads: Array.isArray(data.uploads) ? data.uploads : [],
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
