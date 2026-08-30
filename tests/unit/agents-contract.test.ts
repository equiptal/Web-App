import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { projectToPayload } from "@/lib/contract/project";

/**
 * The contract between this app and the agents backend.
 *
 * Every bug this feature has had in production so far was a shape disagreement across that boundary,
 * and each one cost a deploy to discover: `defaults` nested instead of flat, `monthly` instead of
 * `MONTHLY`. Neither is visible from inside this repo, and both are trivially visible from the
 * backend's own source — which is sitting on the same machine.
 *
 * So these tests READ THE BACKEND rather than restating it. They parse its route table and its
 * validators and check this app against them. Restating the contract here would just be a third
 * place to keep in step.
 *
 * **They skip when the sibling repo is absent** (CI, a fresh clone), because a check that cannot run
 * must not fail — a red build nobody can fix teaches people to ignore red builds.
 */

const AGENTS = path.resolve(process.cwd(), "..", "Moedatech-App", "apps", "backend-agents");
const present = fs.existsSync(AGENTS);
const when = present ? describe : describe.skip;

const read = (p: string) => fs.readFileSync(path.join(AGENTS, p), "utf8");

/** `METHOD /agents/...` for every route the backend actually exposes. */
function routes(): Set<string> {
  const yml = read("serverless.yml");
  const out = new Set<string>();
  const re = /path:\s*(\/agents\/[^\s]+)\s*\n\s*method:\s*(\w+)/g;
  for (const m of yml.matchAll(re)) out.add(`${m[2].toUpperCase()} ${m[1]}`);
  return out;
}

/**
 * Every `/agents/...` path this app's BFF relays to, with its method.
 *
 * Read per EXPORTED HANDLER rather than per file: one route file exports GET, PATCH and DELETE, and
 * pairing every path in it with every method would both miss real gaps and invent false ones.
 */
function relayed(): Set<string> {
  const roots = ["src/app/api/projects", "src/app/api/work-orders", "src/app/api/renter-suppliers", "src/app/api/me/requests"];
  const out = new Set<string>();

  /** `${encodeURIComponent(id)}` → `{}`. Nested parens are why this is not one regex. */
  const normalise = (lit: string) =>
    lit
      .replace(/\$\{[^]*?\}(?=[/`?]|$)/g, "{}")
      .replace(/\$\{[^}]*\}/g, "{}")
      .split("?")[0]
      .trim();

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (e.name !== "route.ts") continue;
      const src = fs.readFileSync(full, "utf8");

      // File-scope path helpers: `const AWARD = (id, awardId) => \`/projects/…\`;`
      const helpers = new Map<string, string>();
      for (const h of src.matchAll(/const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*`([^`]+)`/g)) {
        helpers.set(h[1], normalise(h[2]));
      }

      // Split the file into its exported handlers, so each path is attributed to ONE method.
      const marks = [...src.matchAll(/export async function (GET|POST|PATCH|DELETE)\b/g)];
      marks.forEach((mark, i) => {
        const body = src.slice(mark.index ?? 0, marks[i + 1]?.index ?? src.length);
        const call = body.match(/relayAsRenter\(\s*(`[^`]+`|"[^"]+"|\w+)/);
        if (!call) return;

        const arg = call[1];
        const literal = arg.startsWith("`") || arg.startsWith('"')
          ? normalise(arg.slice(1, -1))
          : helpers.get(arg);
        if (!literal?.startsWith("/")) return;

        out.add(`${mark[1]} /agents${literal}`);
      });
    }
  };

  roots.forEach((r) => walk(path.resolve(process.cwd(), r)));
  return out;
}

/** Normalise `{id}` / `{p}` / `{awardId}` so the two sides can be compared by SHAPE. */
const shape = (s: string) => s.replace(/\{[^}]+\}/g, "{}");

when("the routes this app calls", () => {
  /**
   * Routes this app calls that the backend has NOT built, on purpose.
   *
   * `renter-suppliers` belongs to the suppliers feature and ships before this one reaches
   * production (MA-T13). The award dialog already treats an empty answer as normal and falls back to
   * a typed supplier name, so its absence is a development condition rather than a break — but it is
   * listed here so it is a DECISION rather than a hole nobody noticed.
   */
  const knownAbsent = new Set(["GET /agents/renter-suppliers"]);

  it("all exist on the backend", () => {
    const have = new Set([...routes()].map(shape));
    const missing = [...relayed()]
      .map(shape)
      .filter((r) => !have.has(r) && !knownAbsent.has(r));

    // A relay to a path that does not exist is a 404 the renter reads as "it is broken", and it is
    // invisible here until someone opens the feature on a deployed environment.
    expect(missing, `not on the backend:\n  ${missing.join("\n  ")}`).toEqual([]);
  });
});

when("the project payload", () => {
  const schema = read("src/validators/project.schema.ts");

  /** `PROJECT_DEFAULT_KEYS` — the closed set the backend accepts. */
  const allowed = new Set(
    (schema.match(/PROJECT_DEFAULT_KEYS = \[([\s\S]*?)\]/)?.[1] ?? "")
      .split(",")
      .map((k) => k.trim().replace(/['"]/g, ""))
      .filter(Boolean),
  );

  const body = projectToPayload({
    title: "Qiddiya Zone 4",
    location: { label: "Qiddiya Zone 4, Riyadh", lat: 24.6, lng: 46.5 },
    defaults: {
      timing: { rentalBasis: "monthly", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31" },
      paymentTerms: "net-30",
    },
  });

  it("sends only keys the backend's closed set allows", () => {
    // Their schema is `.strict()`, so ONE unknown key is a 422 for the whole request — which is what
    // a nested `timing` was.
    const sent = Object.keys(body.defaults as Record<string, unknown>);
    const unknown = sent.filter((k) => !allowed.has(k));
    expect(unknown, `rejected by .strict(): ${unknown.join(", ")}`).toEqual([]);
  });

  it("sends a rental basis the backend's enum accepts", () => {
    const enumValues = new Set(
      (schema.match(/PROJECT_RENTAL_BASIS = \[([\s\S]*?)\]/)?.[1] ?? "")
        .split(",")
        .map((v) => v.trim().replace(/['"]/g, ""))
        .filter(Boolean),
    );
    const basis = (body.defaults as Record<string, unknown>).rentalBasis as string | undefined;

    expect(enumValues.size).toBeGreaterThan(0);
    if (basis !== undefined) expect(enumValues.has(basis), `"${basis}" is not in the enum`).toBe(true);
  });

  it("keeps `location` inside the shape the backend validates", () => {
    const loc = body.location as Record<string, unknown>;
    // Their `projectLocationSchema` is `.strict()` on label/lat/lng.
    expect(Object.keys(loc).sort()).toEqual(["label", "lat", "lng"]);
  });
});

when("the award payload", () => {
  it("names the fields the backend's award schema requires", () => {
    const src = read("src/handlers/agents/projects/awards/createAward.ts");
    // These are the ones a missing value fails on, and each is sent by `saveAward`.
    for (const field of ["supplierName", "units", "expectedVersion"]) {
      expect(src.includes(field), `createAward does not mention ${field}`).toBe(true);
    }
  });
});

when("the document payload", () => {
  const attach = read("src/handlers/agents/projects/documents/attachDocument.ts");
  const client = fs.readFileSync(path.resolve(process.cwd(), "src/lib/api/client.ts"), "utf8");
  const ours = client.slice(client.indexOf("export async function attachDocument"), client.indexOf("export async function removeDocument"));

  it("takes a KEY from a presigned upload, and this app sends one", () => {
    // The backend takes a storage key; it never receives bytes. Posting a data URL was a 422 on
    // every attach, and nothing in this repo could see it.
    expect(attach.includes("key:"), "backend no longer takes a key").toBe(true);
    expect(ours.includes("key: presign.key"), "this app is not sending the presigned key").toBe(true);
    expect(ours.includes("data:"), "this app is still sending the file inline").toBe(false);
  });

  it("carries expectedVersion, because attaching rewrites the awards blob", () => {
    expect(attach.includes("expectedVersion")).toBe(true);
    expect(ours.includes("expectedVersion"), "this app is not sending it").toBe(true);
  });

  it("gets the key from the upload-url route, which exists", () => {
    expect([...routes()].some((r) => r.includes("/documents/upload-url"))).toBe(true);
    expect(ours.includes("/documents/upload-url"), "this app is not asking for a presigned URL").toBe(true);
  });

  it("PUTs the bytes straight to storage rather than through this app", () => {
    // A 40 MB scan as a JSON body would cross two hops to reach the same bucket.
    expect(ours.includes('method: "PUT"')).toBe(true);
  });
});

/**
 * WHERE the renter's id has to sit (reported 2026-08-30: every project save returned 422).
 *
 * The backend reads `userId` from whichever place suits each handler — `GET`s and `DELETE`s take it
 * from the query string, `POST`s and `PATCH`es have it as a REQUIRED field inside their zod body
 * schema. The relay only ever put it in the query, so every write failed its schema before reaching
 * a line of handler code, and the renter saw a bare validation error naming no field.
 *
 * This reads the backend's own handlers to decide which is which, so the day one of them moves the
 * read, this test fails rather than the save.
 */
when("where userId is sent", () => {
  it("puts it in the BODY of every write the backend parses from the body", () => {
    const dir = path.join(AGENTS, "src", "handlers", "agents", "projects");
    const fromBody: string[] = [];

    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!e.name.endsWith(".ts")) continue;
        const src = fs.readFileSync(full, "utf8");
        // A body schema that names userId means the write must carry it in the JSON body.
        if (/bodySchema\s*=\s*z\.object\(\{[^]*?userId\s*:/.test(src)) fromBody.push(e.name);
      }
    };
    walk(dir);

    // If this is empty the parse broke, not the contract — fail loudly rather than pass vacuously.
    expect(fromBody.length, "no body-schema userId found; the parse above is wrong").toBeGreaterThan(0);

    const relay = fs.readFileSync(path.resolve(process.cwd(), "src/lib/api/agents-relay.ts"), "utf8");
    expect(relay, "relay must add userId to the body on POST/PATCH").toMatch(/userId\s*\}\)|\.\.\.parsed,\s*userId/);
    expect(relay).toContain('method === "POST"');
    expect(relay).toContain('method === "PATCH"');
  });

  it("still puts it in the query, which is where reads and deletes look", () => {
    const relay = fs.readFileSync(path.resolve(process.cwd(), "src/lib/api/agents-relay.ts"), "utf8");
    expect(relay).toContain("userId=${userId}");
  });
});
