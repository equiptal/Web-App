/**
 * End-to-end check of My Suppliers against a DEPLOYED agents backend.
 *
 * Run:  node scripts/e2e-renter-suppliers.mjs
 *
 * Reads `.env.local` (gitignored) for:
 *   AGENTS_API_URL      the stage to hit
 *   AGENTS_API_TOKEN    the service token — never printed, never committed
 *   AGENTS_TEST_USER_ID the renter to act as; every write is scoped to this account
 *
 * ── It writes, and it cleans up after itself ────────────────────────────────────────────────────
 *
 * There is no read-only way to test a registry: "can a renter add a supplier" is answered by adding
 * one. Every row it creates is named with the RUN TAG below, and the last step deletes them. If the
 * run dies halfway, the tag is what a human searches for.
 *
 * ── It never asserts on data it did not create ──────────────────────────────────────────────────
 *
 * The stage holds the owner's own suppliers. A check that says "the list has 3 rows" fails the day he
 * adds a fourth and tells us nothing about the code, so every assertion here is about a row this run
 * made, or about the SHAPE of what came back.
 */

import { readFileSync } from "node:fs";

/* ── env ─────────────────────────────────────────────────────────────────────────────────────── */

function loadEnv() {
  const out = {};
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* falls through to the check below */
  }
  return { ...out, ...process.env };
}

const env = loadEnv();
const BASE = (env.AGENTS_API_URL || "").replace(/\/$/, "");
const TOKEN = env.AGENTS_API_TOKEN || "";
const USER_ID = Number(env.AGENTS_TEST_USER_ID || 0);

if (!BASE || !TOKEN || !USER_ID) {
  console.error(`
Missing configuration. Create .env.local in the repo root with:

  AGENTS_API_URL=https://<the deployed stage>
  AGENTS_API_TOKEN=<the service token>
  AGENTS_TEST_USER_ID=<a real renter's numeric user id>

.env.local is gitignored. Nothing here prints the token.
`);
  process.exit(2);
}

/* ── plumbing ────────────────────────────────────────────────────────────────────────────────── */

const TAG = `ZZ-E2E-${Date.now()}`;
const results = [];
const made = [];
let failures = 0;

async function call(method, path, body) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}userId=${USER_ID}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    // Reads and deletes take the renter in the query; writes take it in the body as well, which is
    // what the backend parses. Sending both is what the web relay does.
    body: body ? JSON.stringify({ userId: USER_ID, ...body }) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* an empty body is a valid answer for some of these */
  }
  return { status: res.status, data: json && typeof json === "object" && "data" in json ? json.data : json, raw: json };
}

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/* ── the run ─────────────────────────────────────────────────────────────────────────────────── */

console.log(`My Suppliers · end to end\n  stage ${BASE}\n  renter ${USER_ID}\n  tag ${TAG}`);

section("1 · The list answers at all");
const list0 = await call("GET", "/agents/renter-suppliers");
check("GET /renter-suppliers is 200", list0.status === 200, `status ${list0.status}`);
check("it answers an array", Array.isArray(list0.data), typeof list0.data);
if (Array.isArray(list0.data) && list0.data[0]) {
  const r = list0.data[0];
  check("a row carries id, name and the vendor flag", !!r.id && !!r.name && typeof r.vendorRegistered === "boolean");
  check("`onMoedatech` is present — the badge reads this, not `kind`", "onMoedatech" in r, JSON.stringify(Object.keys(r)));
  check("`rollup` is present", !!r.rollup, JSON.stringify(r.rollup ?? null));
} else {
  console.log("  (empty list — the shape checks run on the row created below)");
}

section("2 · Adding one by hand");
const add = await call("POST", "/agents/renter-suppliers", {
  name: `${TAG} Handtyped`,
  phone: "+966550000001",
  email: `${TAG.toLowerCase()}@example.com`,
  vendorRegistered: true,
});
check("POST /renter-suppliers creates", add.status === 200 || add.status === 201, `status ${add.status}`);
const madeId = add.data?.id ?? null;
if (madeId) made.push(madeId);
check("it answers the row with an id", !!madeId, JSON.stringify(add.data)?.slice(0, 200));
check("the row keeps the renter's own name", add.data?.name === `${TAG} Handtyped`, add.data?.name);
check("`kind` is own for a hand-typed row", add.data?.kind === "own", add.data?.kind);

section("3 · Reading it back");
if (madeId) {
  const one = await call("GET", `/agents/renter-suppliers/${encodeURIComponent(madeId)}`);
  check("GET /renter-suppliers/{id} is 200", one.status === 200, `status ${one.status}`);
  check("the profile carries bids[], awards[] and sends[]",
    Array.isArray(one.data?.bids) && Array.isArray(one.data?.awards) && Array.isArray(one.data?.sends),
    JSON.stringify(Object.keys(one.data ?? {})));
}

section("4 · Editing — the vendor flag and the contact");
if (madeId) {
  const patch = await call("PATCH", `/agents/renter-suppliers/${encodeURIComponent(madeId)}`, {
    vendorRegistered: false,
    contactName: "Bandar",
  });
  check("PATCH is 200", patch.status === 200, `status ${patch.status}`);
  check("the flag came back down", patch.data?.vendorRegistered === false, String(patch.data?.vendorRegistered));
  check("the contact name stuck", patch.data?.contactName === "Bandar", patch.data?.contactName);
}

section("5 · The sheet import — the dry run writes nothing");
const rows = [
  { name: `${TAG} Sheet A`, phone: "+966550000002", vendorRegistered: true },
  { name: `${TAG} Sheet B`, email: `${TAG.toLowerCase()}-b@example.com`, vendorRegistered: false },
  // No way to reach it: the backend must refuse this row and name why.
  { name: `${TAG} Sheet C`, vendorRegistered: true },
];
const dry = await call("POST", "/agents/renter-suppliers/bulk", { rows, dryRun: true });
check("bulk?dryRun is 200", dry.status === 200, `status ${dry.status}`);
check("it reports created/merged/rejected",
  Array.isArray(dry.data?.created) && Array.isArray(dry.data?.merged) && Array.isArray(dry.data?.rejected),
  JSON.stringify(Object.keys(dry.data ?? {})));
check("the row with no contact is rejected, with a reason",
  dry.data?.rejected?.some((r) => r.reason), JSON.stringify(dry.data?.rejected ?? []));

const afterDry = await call("GET", "/agents/renter-suppliers");
const dryLeaked = (afterDry.data ?? []).filter((r) => String(r.name).startsWith(TAG) && r.name.includes("Sheet"));
check("the dry run wrote NOTHING", dryLeaked.length === 0, `${dryLeaked.length} rows appeared`);

section("6 · The sheet import — for real");
const real = await call("POST", "/agents/renter-suppliers/bulk", { rows });
check("bulk is 200", real.status === 200, `status ${real.status}`);
for (const c of real.data?.created ?? []) if (c.id) made.push(c.id);
check("two rows landed and one was refused",
  (real.data?.created?.length ?? 0) === 2 && (real.data?.rejected?.length ?? 0) === 1,
  `created ${real.data?.created?.length} rejected ${real.data?.rejected?.length}`);

section("7 · The directory, and linking a real account");
const dir = await call("GET", "/agents/suppliers?limit=5");
check("GET /agents/suppliers is 200", dir.status === 200, `status ${dir.status}`);
const dirRows = Array.isArray(dir.data) ? dir.data : dir.data?.items ?? dir.raw?.data ?? [];
check("it answers rows with an id and a name",
  Array.isArray(dirRows) && dirRows.length > 0 && dirRows[0].id != null,
  JSON.stringify(dirRows?.[0] ?? dir.raw)?.slice(0, 200));

if (Array.isArray(dirRows) && dirRows[0]?.id != null) {
  /* A NUMBER. `users.id` is an integer and the schema says so — the web was sending the string it
     carries the id as, and every link answered 422 (found here, 2026-09-02). */
  const supplierId = Number(dirRows[0].id);
  const link = await call("POST", "/agents/renter-suppliers/link", {
    items: [{ supplierId, vendorRegistered: true }],
  });
  check("POST /link is 200", link.status === 200, `status ${link.status}`);
  const linkedId = link.data?.created?.[0]?.id ?? null;
  if (linkedId) made.push(linkedId);
  check("it created or skipped, and said which",
    (link.data?.created?.length ?? 0) + (link.data?.skipped?.length ?? 0) > 0,
    JSON.stringify(link.data));

  // Twice: the second must be a skip, not an error — a renter ticking a directory does not remember
  // which of thirty firms he added last month.
  const again = await call("POST", "/agents/renter-suppliers/link", {
    items: [{ supplierId, vendorRegistered: true }],
  });
  check("linking the same firm twice is a skip, not a failure",
    again.status === 200 && (again.data?.skipped?.length ?? 0) > 0,
    `status ${again.status} ${JSON.stringify(again.data)}`);
}

section("8 · Groups");
if (madeId) {
  await call("PATCH", `/agents/renter-suppliers/${encodeURIComponent(madeId)}`, { groups: [`${TAG} Earthworks`] });
  const groups = await call("GET", "/agents/renter-suppliers/groups");
  check("GET /groups is 200", groups.status === 200, `status ${groups.status}`);
  check("the new group is listed with a count",
    (groups.data ?? []).some((g) => g.name === `${TAG} Earthworks` && typeof g.count === "number"),
    JSON.stringify(groups.data ?? []).slice(0, 200));

  const renamed = await call("PATCH", "/agents/renter-suppliers/groups", {
    from: `${TAG} Earthworks`,
    to: `${TAG} Earth works`,
  });
  check("PATCH /groups renames", renamed.status === 200, `status ${renamed.status}`);

  // ⚠️ The path shape this app had wrong until 2026-09-01: it was calling `/groups?name=`.
  const del = await call("DELETE", `/agents/renter-suppliers/groups/${encodeURIComponent(`${TAG} Earth works`)}`);
  check("DELETE /groups/{name} is 200 — the path shape, not a query", del.status === 200, `status ${del.status}`);
  check("it says how many rows lost the label and that none were deleted",
    del.data?.removedFrom != null || del.data?.suppliersKept != null,
    JSON.stringify(del.data));
}

section("9 · Suggestions and lookup");
const sugg = await call("GET", "/agents/renter-suppliers/suggestions");
check("GET /suggestions is 200", sugg.status === 200, `status ${sugg.status}`);
check("it answers an array", Array.isArray(sugg.data), typeof sugg.data);

const lookup = await call("GET", "/agents/supplier-lookup?phone=%2B966550000001");
check("GET /supplier-lookup answers 200 or 404, never 500",
  lookup.status === 200 || lookup.status === 404, `status ${lookup.status}`);

section("10 · The declared sends");
if (madeId) {
  const invite = await call("POST", "/agents/renter-suppliers/invites", {
    renterSupplierIds: [madeId],
    channel: "whatsapp",
  });
  check("POST /invites records", invite.status === 200, `status ${invite.status}`);
  check("it says how many landed", invite.data?.recorded != null, JSON.stringify(invite.data));

  // The channel the web offers that the enum may not know yet — backend ask §3.
  const sms = await call("POST", "/agents/renter-suppliers/invites", {
    renterSupplierIds: [madeId],
    channel: "sms",
  });
  check("channel 'sms' is accepted (ask §3) — a 400 here means the enum is still email|whatsapp",
    sms.status === 200, `status ${sms.status}`);

  const profile = await call("GET", `/agents/renter-suppliers/${encodeURIComponent(madeId)}`);
  check("the invite shows on the supplier's history",
    (profile.data?.sends ?? []).some((x) => x.kind === "invite"),
    JSON.stringify(profile.data?.sends ?? []).slice(0, 200));
  check("a send carries `declaredAt` and NOT `opened`",
    (profile.data?.sends ?? []).every((x) => !("opened" in x)),
    JSON.stringify(profile.data?.sends?.[0] ?? {}));
}

section("11 · Cleaning up");
let removed = 0;
for (const id of made) {
  const del = await call("DELETE", `/agents/renter-suppliers/${encodeURIComponent(id)}`);
  if (del.status === 200) removed += 1;
}
check(`every row this run made was removed (${removed}/${made.length})`, removed === made.length);

const final = await call("GET", "/agents/renter-suppliers");
const leftovers = (final.data ?? []).filter((r) => String(r.name).startsWith("ZZ-E2E-"));
check("no ZZ-E2E rows are left on the stage", leftovers.length === 0,
  leftovers.map((r) => r.name).join(", "));

/* ── the report ──────────────────────────────────────────────────────────────────────────────── */

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}  ·  ${results.length} checks`);
if (failures) {
  console.log("\nFailures:");
  for (const r of results.filter((x) => !x.ok)) console.log(`  · ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
process.exit(failures ? 1 : 0);
