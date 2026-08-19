import { NextResponse } from "next/server";
import { agentsGet, agentsPost, agentsPatch, AgentsBackendError } from "@/lib/api/agents-backend";
import { mansourCall } from "@/lib/api/bids-relay";
import { sessionUserId } from "@/lib/api/session-user";
import { mockExportTemplates } from "@/lib/config/env";
import {
  MOCK_DERIVATIONS,
  MOCK_VOCABULARY,
  mockCreate,
  mockDumpFor,
  mockList,
  mockSetSpec,
} from "@/lib/api/mock-export-templates";

/**
 * GET  /api/me/export-templates — the caller's bid-comparison export templates, for the picker.
 * POST /api/me/export-templates — register an uploaded template and get it mapped.
 *
 * Proxies the agents backend's `/agents/export-templates`, which is service-token authed and
 * takes the renter id as `?userId=` — the same shape as `/agents/bids/{id}/documents`.
 *
 * The id comes from `sessionUserId()` (a backend-verified token, never the unsigned `mt_user`
 * cookie), and no session is refused rather than proxied without one: templates are
 * company-scoped and the export embeds suppliers' CR/VAT, so the owner guard is a
 * confidentiality boundary rather than a convenience.
 */

function unauthorized() {
  return NextResponse.json({ code: "unauthorized" }, { status: 401 });
}

function relayError(err: unknown) {
  const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
  const body =
    err instanceof AgentsBackendError
      ? { code: err.code, message: err.message, messageAr: err.messageAr, details: err.details }
      : { message: "Request failed" };
  return NextResponse.json(body, { status });
}

export async function GET() {
  const userId = await sessionUserId();
  if (userId == null) return unauthorized();
  // No agents backend configured → in-memory dev mode, so the UI is walkable without infra.
  if (mockExportTemplates) return NextResponse.json(mockList(userId));
  try {
    // `failed` rows come back on purpose: the picker shows why a template is unusable
    // instead of silently omitting it.
    return NextResponse.json(await agentsGet<unknown>(`/agents/export-templates?userId=${userId}`));
  } catch (err) {
    return relayError(err);
  }
}

interface CreateResult {
  id: string;
  name: string;
  status: string;
  mapping: {
    dump: unknown;
    sheetNames: string[];
    vocabulary: unknown[];
    derivations: string[];
  };
}

interface StoreResult {
  id: string;
  status: string;
  validationErrors?: string[];
}

/**
 * Registering a template starts three hops, but this route only performs the first two:
 *
 *   1. agents backend  → parse the workbook, return the cell dump + field catalogue
 *   2. Mansour         → START a mapping job, get an id back immediately
 *   3. agents backend  → validate the spec and store it  ← done by GET …/[id]/mapping
 *
 * ── Why the mapping is a job rather than an awaited call ─────────────────────────────
 * Mapping a real template takes 20-60s: 66 vocabulary fields, a few hundred cells, and a spec
 * covering every match plus the two-way reconciliation. This route runs on Amplify SSR, behind
 * a gateway that gives up at ~30s. Awaiting it returned 504 to the browser while the work
 * carried on invisibly — the row got created, the user retried, and hit a duplicate-name 409
 * against a row they could not see. So we hand back `status: "mapping"` in about a second and
 * the client polls, exactly as `/rfq/jobs` already works for RFQ normalization.
 *
 * Mansour is called from here rather than from the agents backend deliberately: the web is
 * already the thing that talks to Mansour, so no new service-to-service credentials have to
 * be provisioned. The vocabulary still lives in exactly one place (it travels in step 1's
 * response), and no spec is usable until step 3 has checked it.
 */
export async function POST(req: Request) {
  const userId = await sessionUserId();
  if (userId == null) return unauthorized();

  const body = await req.json();

  /* Dev mode: keep the row in memory and hand the mapper one of the built-in sample layouts.
   * The MAPPING is still a real job on Mansour, so the review screen shows genuine candidates
   * and reasoning — only storage and the parsed file are faked. */
  let created: CreateResult;
  if (mockExportTemplates) {
    const row = mockCreate(userId, String(body.name ?? "Untitled"), String(body.originalFileName ?? ""));
    const sample = mockDumpFor(String(body.originalFileName ?? ""));
    created = {
      id: row.id,
      name: row.name,
      status: row.status,
      mapping: { ...sample, vocabulary: MOCK_VOCABULARY, derivations: MOCK_DERIVATIONS },
    };
  } else {
    try {
      created = await agentsPost<CreateResult>(`/agents/export-templates?userId=${userId}`, body);
    } catch (err) {
      // Format rejections (a renamed PDF, a .docx, an oversized file) surface here.
      return relayError(err);
    }
  }

  const started = await mansourCall<{ job_id: string }>("POST", "/templates/jobs", {
    dump: created.mapping.dump,
    sheetNames: created.mapping.sheetNames,
    vocabulary: created.mapping.vocabulary,
    derivations: created.mapping.derivations,
  });

  /* Could not even START the job — an ops fault (wrong MANSOUR_URL, agent down), not the
   * user's file. Settle the row now with the real reason rather than leaving it at `mapping`
   * for a poller that will never see it change. */
  if (!started.ok) {
    if (mockExportTemplates) {
      mockSetSpec(created.id, null, started.reason);
    } else {
      await agentsPatch<StoreResult>(
        `/agents/export-templates/${encodeURIComponent(created.id)}/spec?userId=${userId}`,
        { failureReason: started.reason }
      ).catch(() => undefined);
    }
    return NextResponse.json({
      id: created.id,
      name: created.name,
      status: "failed",
      mappingError: started.reason,
      ...(mockExportTemplates ? { mock: true } : {}),
    });
  }

  return NextResponse.json({
    id: created.id,
    name: created.name,
    status: "mapping",
    jobId: started.data.job_id,
    mappingError: null,
    ...(mockExportTemplates ? { mock: true } : {}),
  });
}
