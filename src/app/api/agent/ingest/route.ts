import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/ingest — tell the corpus about a match the BROWSER made (W-T22 · NA-T7).
 *
 * A Tier-0 match in the browser writes no row anywhere. Left alone, that is a slow, invisible cost:
 * every RFQ the agent extracts becomes a few-shot candidate and something a reviewer can correct,
 * corrections propose learned rules, and the rules make the next extraction better. Once the fast
 * path takes its share, **half the traffic stops teaching that loop** — and the decline arrives over
 * months as a drift nobody would attribute to this change, because nothing broke.
 *
 * So the browser posts its match here and forgets about it. **Fire-and-forget in the strict sense:**
 * this route always answers 200, the caller never awaits it, and a renter's request is never made
 * to wait on bookkeeping.
 */
export async function POST(req: Request) {
  const body = await req.text().catch(() => "");
  if (!serverEnv.mansourUrl) return NextResponse.json({ stored: false });

  try {
    await fetch(`${serverEnv.mansourUrl}/rfq/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serverEnv.mansourApiToken ? { Authorization: `Bearer ${serverEnv.mansourApiToken}` } : {}),
      },
      body,
      cache: "no-store",
    });
  } catch {
    // Nothing to report and nobody to report it to. The renter already has their answer.
  }
  return NextResponse.json({ stored: true });
}
