import { NextResponse } from "next/server";
import { serverEnv, useRealApp, useRealAuth } from "@/lib/config/env";
import { agentsGet } from "@/lib/api/agents-backend";
import type { TaxonomyResponse, TaxonomyNode } from "@/lib/contract/app";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY runtime-env diagnostic (prod create-flow incident, 2026-06-17). Reports whether the
 * backend env vars actually reach the SSR runtime and whether the live taxonomy fetch succeeds —
 * WITHOUT leaking any secret (host only, never the token). Gated by ?key=. Remove once resolved.
 */
const KEY = "moeda-diag-2026";

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "unparseable";
  }
}

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("key") !== KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Does the live taxonomy fetch actually work from THIS runtime?
  let taxonomyProbe: { ok: boolean; count?: number; error?: string } = { ok: false };
  if (useRealApp) {
    try {
      const data = await agentsGet<TaxonomyResponse | TaxonomyNode[]>("/agents/taxonomy?tenant=default");
      const nodes = Array.isArray(data) ? data : data.nodes;
      taxonomyProbe = { ok: true, count: Array.isArray(nodes) ? nodes.length : -1 };
    } catch (err) {
      taxonomyProbe = { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
    }
  } else {
    taxonomyProbe = { ok: false, error: "useRealApp is false — agents URL/token not present at runtime" };
  }

  return NextResponse.json({
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? null,
      useRealApp, // needs AGENTS_API_URL + AGENTS_API_TOKEN
      useRealAuth, // needs APP_API_URL
    },
    env: {
      agentsApiUrlHost: host(serverEnv.agentsApiUrl),
      agentsApiTokenSet: Boolean(serverEnv.agentsApiToken),
      agentsApiTokenLen: serverEnv.agentsApiToken ? serverEnv.agentsApiToken.length : 0,
      // Non-secret fingerprint (first 6 + last 6) to tell staging (…597da1) from prod (…460d9ff).
      agentsApiTokenFp: serverEnv.agentsApiToken
        ? `${serverEnv.agentsApiToken.slice(0, 6)}…${serverEnv.agentsApiToken.slice(-6)}`
        : null,
      appApiUrlHost: host(serverEnv.appApiUrl),
      mansourUrlHost: host(serverEnv.mansourUrl),
      tenantId: serverEnv.tenantId,
    },
    taxonomyProbe,
  });
}
