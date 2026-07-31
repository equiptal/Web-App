import { NextResponse } from "next/server";
import { agentsGet, agentsPost, agentsPatch, AgentsBackendError } from "@/lib/api/agents-backend";
import { mansourPost } from "@/lib/api/bids-relay";
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

interface MapResult {
  ok?: boolean;
  model?: string;
  spec?: unknown;
  error?: string;
  terminal?: boolean;
}

/**
 * Registering a template is three hops, all server-side, so the browser still makes one call:
 *
 *   1. agents backend  → parse the workbook, return the cell dump + field catalogue
 *   2. Mansour         → map it (this app already holds those credentials for /bids/*)
 *   3. agents backend  → validate the spec against the real sheet and store it
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
   * The MAPPING below is still a real call to Mansour, so the review screen shows genuine
   * candidates and reasoning — only storage and the parsed file are faked. */
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

  const ask = (previousErrors?: string[]) =>
    mansourPost<MapResult>("/templates/map", {
      dump: created.mapping.dump,
      sheetNames: created.mapping.sheetNames,
      vocabulary: created.mapping.vocabulary,
      derivations: created.mapping.derivations,
      ...(previousErrors?.length ? { previousErrors } : {}),
    });

  try {
    let mapped = await ask();

    if (mockExportTemplates) {
      mockSetSpec(created.id, (mapped?.spec as Record<string, unknown>) ?? null, mapped?.error);
      return NextResponse.json({
        id: created.id,
        name: created.name,
        status: mapped?.spec ? "needs_review" : "failed",
        mappingError: mapped?.spec ? null : mapped?.error ?? "the mapper did not return a mapping",
        mock: true,
      });
    }

    if (!mapped?.ok || !mapped.spec) {
      /* Record the real cause rather than pushing a placeholder spec through the validator,
       * which would bury it under shape complaints the user cannot act on. The row already
       * exists, so it must not be left stuck at `mapping` either. */
      await agentsPatch<StoreResult>(
        `/agents/export-templates/${encodeURIComponent(created.id)}/spec?userId=${userId}`,
        {
          failureReason: mapped?.error ?? "the mapping service did not return a mapping",
          model: mapped?.model,
        }
      ).catch(() => undefined);
      return NextResponse.json(
        { id: created.id, name: created.name, status: "failed", mappingError: mapped?.error ?? "the mapper did not return a mapping" },
        { status: 200 }
      );
    }

    let stored = await agentsPatch<StoreResult>(
      `/agents/export-templates/${encodeURIComponent(created.id)}/spec?userId=${userId}`,
      { spec: mapped.spec, model: mapped.model }
    );

    // One corrective retry: the mapper gets the validator's exact complaints rather than a
    // blind re-roll. A refusal is terminal and is not retried.
    if (stored.status === "failed" && stored.validationErrors?.length && !mapped.terminal) {
      mapped = await ask(stored.validationErrors);
      if (mapped?.ok && mapped.spec) {
        stored = await agentsPatch<StoreResult>(
          `/agents/export-templates/${encodeURIComponent(created.id)}/spec?userId=${userId}`,
          { spec: mapped.spec, model: mapped.model }
        );
      }
    }

    return NextResponse.json({
      id: created.id,
      name: created.name,
      status: stored.status,
      mappingError: stored.validationErrors?.join("\n") ?? null,
    });
  } catch (err) {
    return relayError(err);
  }
}
