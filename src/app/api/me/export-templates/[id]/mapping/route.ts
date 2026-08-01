import { NextResponse } from "next/server";
import { agentsPatch, AgentsBackendError } from "@/lib/api/agents-backend";
import { mansourCall } from "@/lib/api/bids-relay";
import { sessionUserId } from "@/lib/api/session-user";
import { mockExportTemplates } from "@/lib/config/env";
import { mockResolve, mockSetSpec } from "@/lib/api/mock-export-templates";

interface StoreResult {
  id: string;
  status: string;
  validationErrors?: string[];
}

interface JobView {
  id: string;
  status: "pending" | "processing" | "done" | "error";
  result: { ok?: boolean; model?: string; spec?: unknown; error?: string; terminal?: boolean } | null;
  error: string | null;
}

/**
 * GET /api/me/export-templates/:id/mapping?jobId=… — advance one mapping job.
 *
 * Mapping runs as a background job on the agent (see the POST that creates it): a real template
 * takes 20-60s and Amplify's gateway cuts off at ~30s, so awaiting it inline returned 504 while
 * the work carried on invisibly. The client polls here instead.
 *
 * Each call answers one of:
 *   - `mapping`  → still running; poll again.
 *   - anything else → settled. The spec has been validated and stored by then.
 *
 * Storing happens HERE rather than on the agent so the validator stays on the side that owns
 * the renderer and knows the sheet bounds — the same reason the synchronous version stored it
 * from the web. Moving the call off the request thread changed the timing, not the boundary.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ message: "jobId required" }, { status: 400 });

  /** Record why mapping failed, so the row settles instead of polling forever. */
  const settleFailed = async (reason: string) => {
    if (mockExportTemplates) mockSetSpec(id, null, reason);
    else
      await agentsPatch<StoreResult>(
        `/agents/export-templates/${encodeURIComponent(id)}/spec?userId=${userId}`,
        { failureReason: reason }
      ).catch(() => undefined);
    return NextResponse.json({ id, status: "failed", mappingError: reason });
  };

  try {
    const polled = await mansourCall<JobView>("GET", `/templates/jobs/${encodeURIComponent(jobId)}`);

    if (!polled.ok) {
      /* A 404 is the in-memory job store having lost the job — almost always a redeploy mid-map.
       * Terminal on purpose: the alternative is a row that sits at `mapping` for good. The
       * template is still in S3, so "upload it again" is a real remedy we can state. */
      if (polled.kind === "http" && polled.status === 404) {
        return settleFailed("the mapping was interrupted before it finished — please try again");
      }
      return settleFailed(polled.reason);
    }

    const job = polled.data;
    if (job.status === "pending" || job.status === "processing") {
      return NextResponse.json({ id, status: "mapping", jobId });
    }
    if (job.status === "error") {
      return settleFailed(job.error ?? "the mapping service failed");
    }

    // `done` with ok:false is the mapper having read the sheet and been unable to map it —
    // a real answer for the user, distinct from the transport failures above.
    const mapped = job.result;
    if (!mapped?.ok || !mapped.spec) {
      return settleFailed(mapped?.error ?? "the mapper did not return a mapping");
    }

    if (mockExportTemplates) {
      mockSetSpec(id, mapped.spec as Record<string, unknown>);
      return NextResponse.json({ id, status: "needs_review", mappingError: null, mock: true });
    }

    const stored = await agentsPatch<StoreResult>(
      `/agents/export-templates/${encodeURIComponent(id)}/spec?userId=${userId}`,
      { spec: mapped.spec, model: mapped.model }
    );

    /* One corrective retry: the mapper gets the validator's exact complaints rather than a
     * blind re-roll. It re-runs against the input the agent already holds, so the cell dump
     * never crosses the wire twice. A refusal is terminal and is not retried.
     *
     * Returned as `mapping` with the NEW job id — the retry is itself a 20-60s job, and
     * awaiting it here would reintroduce the very timeout this route exists to avoid. */
    if (stored.status === "failed" && stored.validationErrors?.length && !mapped.terminal) {
      const retry = await mansourCall<{ job_id: string }>(
        "POST",
        `/templates/jobs/${encodeURIComponent(jobId)}/retry`,
        { previousErrors: stored.validationErrors }
      );
      if (retry.ok) return NextResponse.json({ id, status: "mapping", jobId: retry.data.job_id });
    }

    return NextResponse.json({
      id,
      status: stored.status,
      mappingError: stored.validationErrors?.join("\n") ?? null,
    });
  } catch (err) {
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    const payload =
      err instanceof AgentsBackendError
        ? { code: err.code, message: err.message, messageAr: err.messageAr, details: err.details }
        : { message: "Request failed" };
    return NextResponse.json(payload, { status });
  }
}

/**
 * PATCH /api/me/export-templates/:id/mapping — apply the user's decisions on the reconciliation
 * and flip the template to `ready`.
 *
 * Resolutions persist on the stored mapping, which is what makes a template CONVERGE: resolve
 * "Mob/Demob" once and that cell fills on every export afterwards, rather than the question
 * being re-asked each time. The backend re-validates the edited mapping, so an invalid
 * correction comes back with the specific problem rather than being stored.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (mockExportTemplates) {
      const view = mockResolve(id, body);
      return view
        ? NextResponse.json(view)
        : NextResponse.json({ message: "Template not found" }, { status: 404 });
    }
    return NextResponse.json(
      await agentsPatch<unknown>(
        `/agents/export-templates/${encodeURIComponent(id)}/mapping?userId=${userId}`,
        body
      )
    );
  } catch (err) {
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    const payload =
      err instanceof AgentsBackendError
        ? { code: err.code, message: err.message, messageAr: err.messageAr, details: err.details }
        : { message: "Request failed" };
    return NextResponse.json(payload, { status });
  }
}
