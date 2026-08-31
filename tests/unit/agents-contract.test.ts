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
   * My Suppliers (SUP) is built web-first: the contract, the BFF and the screens land before the
   * table exists, so the work is reviewed against something real rather than a description. Until
   * then the list read answers an empty array — the truth a renter sees either way — and every WRITE
   * answers 503 rather than a false success.
   *
   * Each entry is a DECISION rather than a hole nobody noticed, and the test below keeps it that way:
   * an entry the backend has since built fails until it is deleted from here.
   *
   * Owned by `docs/implementation-plans/renter-suppliers/backend-tickets.md` — SUP-BE-3…8, BE-14.
   */
  const knownAbsent = new Set([
    // GET /agents/renter-suppliers is BUILT — the guard below caught the stale waiver.
    "POST /agents/renter-suppliers",
    // GET /agents/renter-suppliers/{} is BUILT — caught by the guard below, 2026-09-01.
    "PATCH /agents/renter-suppliers/{}",
    "DELETE /agents/renter-suppliers/{}",
    "POST /agents/renter-suppliers/bulk",
    "POST /agents/renter-suppliers/link",
    "GET /agents/renter-suppliers/groups",
    "PATCH /agents/renter-suppliers/groups",
    "DELETE /agents/renter-suppliers/groups",
  ]);

  it("all exist on the backend", () => {
    const have = new Set([...routes()].map(shape));
    const missing = [...relayed()]
      .map(shape)
      .filter((r) => !have.has(r) && !knownAbsent.has(r));

    // A relay to a path that does not exist is a 404 the renter reads as "it is broken", and it is
    // invisible here until someone opens the feature on a deployed environment.
    expect(missing, `not on the backend:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  /**
   * A waiver outlives its reason unless something removes it.
   *
   * The day the backend builds one of these, the entry above stops describing reality and starts
   * hiding a route nobody is checking any more. So an entry that HAS been built fails here until it
   * is deleted — the list can only shrink, and only by hand, which is the point of it.
   */
  it("nothing waived above has since been built", () => {
    const have = new Set([...routes()].map(shape));
    const stale = [...knownAbsent].filter((r) => have.has(r));
    expect(stale, `built now — delete from knownAbsent:\n  ${stale.join("\n  ")}`).toEqual([]);
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
  const client = code(path.resolve(process.cwd(), "src/lib/api/client.ts"));
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

    const relay = code(path.resolve(process.cwd(), "src/lib/api/agents-relay.ts"));
    expect(relay, "relay must add userId to the body on POST/PATCH").toMatch(/userId\s*\}\)|\.\.\.parsed,\s*userId/);
    expect(relay).toContain('method === "POST"');
    expect(relay).toContain('method === "PATCH"');
  });

  it("still puts it in the query, which is where reads and deletes look", () => {
    const relay = code(path.resolve(process.cwd(), "src/lib/api/agents-relay.ts"));
    expect(relay).toContain("userId=${userId}");
  });
});

/* ─────────────────────────── Required fields, read from the backend ─────────────────────────── */

/**
 * A file's CODE, with its comments removed.
 *
 * Every assertion below reads source as text, and a prose comment naming the very thing being
 * checked will satisfy a `toContain` while the code does the opposite. That is not theoretical:
 * deleting the handling of `PROJECT_VERSION_CONFLICT` left these tests green, because the comment
 * explaining the two codes still mentioned it.
 */
function code(abs: string): string {
  return fs
    .readFileSync(abs, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** One handler's zod body schema, as raw text. */
function schemaOf(rel: string): string {
  const src = fs.readFileSync(path.join(AGENTS, "src", "handlers", "agents", rel), "utf8");
  const i = src.search(/const bodySchema\s*=/);
  if (i === -1) return "";
  return src.slice(i, src.indexOf("export const handler", i));
}

/** Is `field` required — present in the schema, and not marked optional on its own line? */
function required(schema: string, field: string): boolean {
  const line = new RegExp(String.raw`^\s*${field}\s*:.*$`, "m").exec(schema)?.[0];
  return !!line && !line.includes(".optional()");
}

when("every required field is actually sent", () => {
  const client = () => code(path.resolve(process.cwd(), "src/lib/api/client.ts"));

  it("sends expectedVersion wherever the backend demands one", () => {
    /* This is the fault that cost a day. `createProject` does not take a version and `updateProject`
       does; the web sent neither, so making a site worked and editing one answered a bare 422. Read
       the requirement off the schema rather than restating it. */
    const cases: [string, RegExp][] = [
      ["projects/updateProject.ts", /export async function updateProject\([^]*?expectedVersion[^]*?^}/m],
      ["work-orders/createWorkOrder.ts", /export async function saveWorkOrder\([^]*?expectedVersion[^]*?^}/m],
      ["projects/awards/createAward.ts", /export async function saveAward\([^]*?expectedVersion[^]*?^}/m],
      ["projects/documents/attachDocument.ts", /export async function attachDocument\([^]*?expectedVersion[^]*?^}/m],
    ];

    for (const [handler, sends] of cases) {
      const schema = schemaOf(handler);
      if (!required(schema, "expectedVersion")) continue; // it stopped being required; nothing to check
      expect(client(), `${handler} requires expectedVersion`).toMatch(sends);
    }
  });

  it("never sends expectedVersion to the work-order update, whose schema is strict", () => {
    const schema = schemaOf("work-orders/updateWorkOrder.ts");
    expect(schema).toContain("strict()");
    expect(schema, "if this gains expectedVersion, saveWorkOrder must send it").not.toMatch(/^\s*expectedVersion\s*:/m);
  });
});

when("the strict schemas get no unknown keys", () => {
  it("keeps groupId and awards out of the work-order body", () => {
    const form = code(path.resolve(process.cwd(), "src/components/projects/WorkOrderForm.tsx"));
    const payload = form.slice(form.indexOf("export function workOrderPayload"));

    // `groupId` picks the route; it is not a field either schema knows.
    expect(payload).toMatch(/groupId: draft\.groupId,/);
    expect(payload).toContain("body: {");
    // Awards hang on their machine as `supplyLines`. A top-level `awards` array is a 422.
    expect(payload).toContain("supplyLines");
    expect(payload, "a top-level awards array fails the strict schema").not.toMatch(/^\s*awards: draft\./m);
  });

  it("names the taxonomy ids the way the item schema does", () => {
    const woSchema = fs.readFileSync(path.join(AGENTS, "src", "validators", "work-order.schema.ts"), "utf8");
    /* The KEYS live on the base object; `workOrderItemSchema` is now just the base wrapped in its
       naming rule, so slicing from that name would find a one-line wrapper and no fields. */
    const item = woSchema.slice(woSchema.indexOf("export const workOrderItemBase"));
    for (const key of ["categoryId", "subcategoryId", "measurementId"]) {
      expect(item, `item schema should name ${key}`).toMatch(new RegExp(`${key}\s*:`));
    }
    // Flat, not nested: there is no `ref` key in the schema, so sending one is an unknown key.
    expect(item.slice(0, item.indexOf("strict()"))).not.toMatch(/^\s*ref\s*:/m);
  });
});

when("enums line up", () => {
  const validators = () => fs.readFileSync(path.join(AGENTS, "src", "validators", "project.schema.ts"), "utf8");

  it("keeps the award basis lower case and the period basis upper case", () => {
    /* The same idea is spelled two ways in one feature, which is exactly the kind of thing a person
       gets right once and wrong the second time. */
    const src = validators();
    expect(src).toMatch(/AWARD_RENTAL_BASIS = \['daily', 'weekly', 'monthly'\]/);
    expect(src).toMatch(/PROJECT_RENTAL_BASIS = \['DAILY'/);

    const form = code(path.resolve(process.cwd(), "src/components/projects/WorkOrderForm.tsx"));
    expect(form, "the period's basis must be upper-cased on the way out").toContain("toUpperCase()");
  });

  it("offers only the file types storage will accept", () => {
    const upload = fs.readFileSync(
      path.join(AGENTS, "src", "handlers", "agents", "projects", "documents", "createUploadUrl.ts"),
      "utf8",
    );
    const allowed = [...upload.matchAll(/'(application\/pdf|image\/\w+)'/g)].map((m) => m[1]);
    expect(allowed.length, "parse the contentType enum").toBeGreaterThan(0);

    const award = code(path.resolve(process.cwd(), "src/lib/contract/award.ts"));
    const table = award.slice(award.indexOf("const ACCEPTED"), award.indexOf("export function contentTypeFor"));
    for (const type of allowed) expect(table, `${type} should be offered`).toContain(type);
    // Word and Excel were offered and refused on the way out, with nothing useful said.
    expect(table).not.toMatch(/msword|spreadsheet|officedocument/);
  });
});

when("409s keep their meaning", () => {
  it("knows both version-conflict codes, which are two names for one thing", () => {
    const codes = new Set<string>();
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!e.name.endsWith(".ts")) continue;
        for (const m of fs.readFileSync(full, "utf8").matchAll(/'(PROJECT_VERSION_[A-Z]+)'/g)) codes.add(m[1]);
      }
    };
    walk(path.join(AGENTS, "src", "handlers", "agents"));
    expect(codes.size, "parse the conflict codes").toBeGreaterThan(0);

    const client = code(path.resolve(process.cwd(), "src/lib/api/client.ts"));
    for (const code of codes) {
      expect(client, `${code} must reach ProjectVersionConflict, not a bare unknown error`).toContain(code);
    }
  });
});

when("the work-order item schema can actually hold supplyLines", () => {
  it("widens the key set instead of intersecting a strict object with it", () => {
    /* `workOrderItemSchema.and(z.object({ supplyLines }))` refused the key on every request: an
       intersection parses against BOTH halves, and the left half is `.strict()`. Because the
       refusal lands on the whole body, the work order, its machines and its period went with it.

       Asserted from this repo because this repo is what breaks: `workOrderPayload` sends
       `supplyLines` on create, and a silent revert there turns every populated work order into a
       422 that names a key the web is right to be sending. */
    const src = fs.readFileSync(
      path.join(AGENTS, "src", "handlers", "agents", "work-orders", "createWorkOrder.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    const items = src.slice(src.indexOf("items: z"), src.indexOf("max(50)"));
    expect(items, "supplyLines must be added by widening the item's own keys").toContain("extend(");
    expect(items, "an intersection with a strict object can never accept the added key").not.toMatch(/\.and\(/);
  });
});

/* ============================================================================================== *
 * The web's evidence-only tag, checked across all three repos
 * ============================================================================================== */

/**
 * `/rfq/jobs` is shared between this app and the mobile app, and they need OPPOSITE behaviour from
 * it (owner, 2026-08-31: *"for app i want to have a tag or something for web to use this new
 * approach and if on app will remain as it is now"*).
 *
 * The agent is instructed to fill every field, which is right for mobile — it has no project pills
 * and no work-order templates, so an unstated responsibility has nowhere else to come from. On the
 * web the same default overwrites a term the renter saved on their own site, and arrives looking
 * exactly like something they just typed.
 *
 * Three facts have to hold together, in three repos, and no single repo can see all three. So this
 * reads the other two rather than restating them.
 */
const AGENT = path.resolve(process.cwd(), "..", "Normalization-Agent");
const MOBILE = path.resolve(process.cwd(), "..", "Moedatech-App", "apps", "mobile");

const tagWhen = fs.existsSync(AGENT) ? describe : describe.skip;

tagWhen("the evidence-only tag", () => {
  const agentFile = (rel: string) => fs.readFileSync(path.join(AGENT, rel), "utf8");

  it("this app sends it on every parse", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "api", "agent", "process", "route.ts"),
      "utf8",
    );
    expect(route).toMatch(/evidence_only:\s*true/);
  });

  it("the agent accepts it on the shared job route", () => {
    const handler = agentFile(path.join("src", "handlers", "rfq", "jobs.handler.ts"));
    expect(handler, "declared on the body it parses").toMatch(/evidence_only\?:\s*boolean/);
    /* And in the dedup fingerprint. Two callers asking the same words for DIFFERENT answers must not
       share a job: serving one the other's result hands back invented values to the caller that
       opted out of them, or none to the caller that needs them. */
    expect(handler, "part of the job fingerprint").toMatch(/evidence:\$\{/);
  });

  it("the agent only changes behaviour when it is set", () => {
    const service = agentFile(path.join("src", "services", "rfq.service.ts"));
    // The addendum is conditional, so an absent tag is today's prompt byte for byte. Substrings
    // rather than a regex: the line contains escaped newlines, and a regex over those is a test
    // that fails on its own quoting rather than on the code.
    expect(service).toContain("evidenceOnly ?");
    expect(service).toContain("EVIDENCE_ONLY_ADDENDUM : ''");
  });

  it("and it rides the volatile tail, not the cached prefix", () => {
    const service = agentFile(path.join("src", "services", "rfq.service.ts"));
    const tail = service.slice(service.indexOf("const volatileTail"), service.indexOf("const systemBlocks"));
    expect(tail).toContain("EVIDENCE_ONLY_ADDENDUM");
    /* A prefix that differs per caller is a prefix that is never a cache hit, and the instructions
       plus the taxonomy are 26k tokens of it. */
    expect(service.indexOf("EVIDENCE_ONLY_ADDENDUM", service.indexOf("const volatileTail"))).toBeLessThan(
      service.indexOf("cache_control", service.indexOf("const systemBlocks")),
    );
  });
});

(fs.existsSync(MOBILE) ? describe : describe.skip)("the mobile app is left as it is", () => {
  it("does not send the tag", () => {
    const svc = fs.readFileSync(
      path.join(MOBILE, "lib", "features", "equipment_requests", "data", "services", "rfq_parse_service.dart"),
      "utf8",
    );
    expect(svc, "mobile keeps today's behaviour, which needs the defaults").not.toContain("evidence_only");
  });
});
