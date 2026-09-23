import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";
import { userIdFromRequest } from "@/lib/api/bids-relay";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/quick — the equipment-only fast path (web-app/007, W-T21).
 *
 * Relays to `{MANSOUR_URL}/rfq/quick`, which answers synchronously: Tier 0 in-process if the line
 * is a quantity, a name and a size, Tier 1 on Haiku otherwise. No job row, no 202, no poll — the
 * poll alone was a fixed 1–3 seconds on top of the extraction.
 *
 * ── `/api/agent/rfq` is untouched ────────────────────────────────────────────────────────────────
 *
 * A renter pasting a paragraph, one without a project, and every mobile request take today's path
 * byte-identical: same model, same prompt, same polling. This is a second door, not a change to the
 * first one.
 *
 * ── It always falls back rather than failing ─────────────────────────────────────────────────────
 *
 * Any non-2xx, any timeout, any unreachable service returns `{ fallback: true }` and the caller runs
 * the job path instead. A renter must never lose their request because an optimisation was
 * unavailable — the worst outcome here is the speed we already have.
 */

/** Past this, the job path would have been the better bet anyway. */
const TIMEOUT_MS = 8000;

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");

  if (!serverEnv.mansourUrl) {
    return NextResponse.json({ fallback: true, reason: "not_configured" }, { status: 200 });
  }

  /* ── `created_by`, stamped here because only this side can read the cookie ──────────────────────
     This route was an opaque pass-through, so the fast lane sent no `created_by` at all while the
     job path has stamped it from the `mt_user` cookie for a while. Two consequences, both
     invisible: every Tier-1 row in the corpus was attributed to the agent's `web-app` default
     rather than to a renter, and Mansour's per-caller rate limiter keys on `created_by` — so ALL
     website traffic arriving through this one BFF counted as a single caller and would throttle
     together under load.

     A parse failure leaves the body untouched rather than dropping the request: the renter's answer
     matters more than the attribution, and the relay's own fallback still covers a bad body. */
  let body = raw;
  const userId = userIdFromRequest(req);
  if (userId && raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      body = JSON.stringify({ created_by: userId, ...parsed });
    } catch {
      /* not JSON — forward it as-is and let the upstream reject it */
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${serverEnv.mansourUrl}/rfq/quick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serverEnv.mansourApiToken ? { Authorization: `Bearer ${serverEnv.mansourApiToken}` } : {}),
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      // 200 with a fallback flag, not the upstream status: this is not the renter's error, and the
      // caller's job is to take the other path rather than to render a failure.
      return NextResponse.json({ fallback: true, reason: `upstream_${res.status}` }, { status: 200 });
    }

    const json: unknown = await res.json();
    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    return NextResponse.json(data ?? { fallback: true, reason: "empty" });
  } catch {
    return NextResponse.json({ fallback: true, reason: "unreachable" }, { status: 200 });
  } finally {
    clearTimeout(timer);
  }
}
