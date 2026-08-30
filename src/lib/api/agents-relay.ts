import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";
import { sessionUserId } from "@/lib/api/session-user";

/**
 * SERVER-ONLY relay for the renter's own project data (web-app/007, W-T2).
 *
 * Every project route is the same four moves — refuse without a session, forward the verified
 * `userId`, pass the upstream status and body straight through, unwrap the `{ data }` envelope — so
 * they are written once here rather than eleven times.
 *
 * ── Why no `AGENTS_TEST_USER_ID` fallback ────────────────────────────────────────────────────────
 *
 * `api/requests/route.ts` keeps one, and deliberately: there `userId` is *creator attribution*, and
 * dropping it would turn a session-less submit into a fabricated 201. Here `userId` is the
 * *authorization* — it is the entire owner check from our side — so a fallback would hand one
 * company's sites, awards and purchase orders to a caller with no session at all. No session is a
 * 401.
 *
 * ── Why the upstream status is passed through verbatim ───────────────────────────────────────────
 *
 * **409 carries meaning here.** An award write sends the `version` it read, and a mismatch comes
 * back `PROJECT_VERSION_STALE` with the current version so the client can re-read and re-apply.
 * `UNITS_EXCEED_QUANTITY` and `REQUEST_NOT_FILED` are the same shape: instructions, not dead ends.
 * Collapsing them into a generic 502 would turn "somebody else awarded first, reloading" into "it
 * broke", and the renter would retry into the same wall.
 */

export type RelayInit = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** Raw JSON body to forward. Read it in the route — a Request body can only be consumed once. */
  body?: string;
};

/**
 * Relay one call to `/agents{path}` as the signed-in renter.
 *
 * Returns the response to hand straight back from the route. Never throws for an upstream failure:
 * a bad gateway is a 502 with a code the UI can branch on, not an unhandled rejection in a route.
 */
export async function relayAsRenter(path: string, init: RelayInit = {}): Promise<NextResponse> {
  if (!serverEnv.agentsApiUrl || !serverEnv.agentsApiToken) {
    return NextResponse.json({ code: "not_configured" }, { status: 503 });
  }

  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });

  const url = `${serverEnv.agentsApiUrl}/agents${path}${path.includes("?") ? "&" : "?"}userId=${userId}`;

  /**
   * The renter's id goes in the QUERY and, on a write, in the BODY as well.
   *
   * The backend reads it from whichever place suits the handler: `GET`s and `DELETE`s take it from
   * the query string, while `POST`s and `PATCH`es have it inside their zod body schema as a required
   * field. Sending it in one place only meant every write returned 422 with no clue which field was
   * missing — the schema's own error, and correct, but the caller sees a generic validation failure.
   *
   * Adding it here rather than at each call site is deliberate: every write in this feature passes
   * through this function, and a rule applied in one place cannot be forgotten in the twelfth.
   *
   * A body that already names a `userId` is left alone. Nothing does today, and if something ever
   * needs to act for a different user this must not silently overwrite it.
   */
  const method = init.method ?? "GET";
  let body = init.body;
  if (body && (method === "POST" || method === "PATCH")) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.userId === undefined) {
        body = JSON.stringify({ ...parsed, userId });
      }
    } catch {
      // Not JSON. Pass it through untouched rather than guessing at its shape.
    }
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serverEnv.agentsApiToken}` },
      body,
      cache: "no-store",
    });

    /**
     * A 204 carries no body, and `NextResponse.json` THROWS when handed one at that status.
     *
     * `deleteProject` answers 204. The throw landed in the catch below, so a delete that had already
     * removed the row reported `upstream_unreachable` — the renter was told the server could not be
     * reached by an action that had just succeeded, and a reload showed the site gone. Found by
     * running the delete against staging; no amount of shape-checking would have caught it, because
     * the shape was right and the STATUS was the problem.
     */
    if (res.status === 204 || res.status === 205 || res.status === 304) {
      return new NextResponse(null, { status: res.status });
    }

    const json: unknown = await res.json().catch(() => null);

    // Errors keep the backend's own status, code and details — see the note above about 409.
    if (!res.ok) return NextResponse.json(json ?? { code: "upstream" }, { status: res.status });

    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    return NextResponse.json(data ?? null, { status: res.status });
  } catch {
    // A network failure, not a refusal. Distinct from 401/409 so the UI can offer *retry* rather
    // than telling the renter they are not allowed to do something they are allowed to do.
    return NextResponse.json({ code: "upstream_unreachable" }, { status: 502 });
  }
}

/** Read a request's body as raw text, or `undefined` when it has none. */
export async function rawBody(req: Request): Promise<string | undefined> {
  const text = await req.text().catch(() => "");
  return text ? text : undefined;
}
