/**
 * **Regenerate the pin tables from the registry** (owner, 2026-09-08: *"make sure the pins are
 * detailed and fine not general and make sure all new elements created on web are added with pins"*).
 *
 * `docs/ui-pins.md` has always SAID its table is generated from `src/lib/uiPins.ts`; nothing
 * generated it, so the two drifted every time a pin was added. This is that script, and it also
 * writes the surface map `/web:change` reads — one source, two readers:
 *
 *   node scripts/ui-pins-doc.mjs          # rewrite both tables
 *   node scripts/ui-pins-doc.mjs --check  # fail if either is stale (used by the test)
 *
 * It parses the registry with a regex rather than importing it: this file runs under plain node with
 * no TypeScript loader, and the registry is a flat literal by design (see its own header).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const REGISTRY = resolve(ROOT, "src/lib/uiPins.ts");
const DOC = resolve(ROOT, "docs/ui-pins.md");
const MAP = resolve(ROOT, "docs/ui-surface-map.md");

const START = "<!-- pins:start -->";
const END = "<!-- pins:end -->";

/** Every registry row, in file order: `id`, its number, its label and the file it names. */
export function readRegistry(source = readFileSync(REGISTRY, "utf8")) {
  const rows = [];
  const re = /"([a-z0-9-]+)":\s*\{\s*n:\s*"([\d.]+)",\s*label:\s*"([^"]*)",\s*file:\s*"([^"]*)"\s*\}/g;
  for (const m of source.matchAll(re)) rows.push({ id: m[1], n: m[2], label: m[3], file: m[4] });
  return rows;
}

/** "17.10" after "17.9": segment by segment as integers, never as a float or a string. */
export function byNumber(a, b) {
  const x = a.n.split(".").map(Number);
  const y = b.n.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** The `docs/ui-pins.md` table: number (indented for a part), what it is, and its file. */
export function pinTable(rows) {
  const out = ["| # | What | File |", "| --- | --- | --- |"];
  for (const r of [...rows].sort(byNumber)) {
    const part = r.n.includes(".");
    const num = part ? `&nbsp;&nbsp;**${r.n}**` : `**${r.n}**`;
    out.push(`| ${num} | ${r.label} | \`${r.file}\` |`);
  }
  return out.join("\n");
}

/**
 * The surface map `/web:change` reads: one row per pin, with the id, so a note that says «47.3» is
 * resolved to a file without a search — and grouped by file, so a batch touching one file is one
 * edit rather than four.
 */
export function surfaceMap(rows) {
  const byFile = new Map();
  for (const r of [...rows].sort(byNumber)) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  const out = [
    "| File | Pins |",
    "| --- | --- |",
  ];
  for (const [file, list] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const pins = list.map((r) => `${r.n} ${r.label} (\`${r.id}\`)`).join(" · ");
    out.push(`| \`${file}\` | ${pins} |`);
  }
  return out.join("\n");
}

function splice(path, body, title) {
  const raw = readFileSync(path, "utf8");
  const a = raw.indexOf(START);
  const b = raw.indexOf(END);
  if (a < 0 || b < 0) {
    throw new Error(`${path} has no ${START} / ${END} markers — add them around the ${title} table`);
  }
  return raw.slice(0, a + START.length) + "\n" + body + "\n" + raw.slice(b);
}

const rows = readRegistry();
const doc = splice(DOC, pinTable(rows), "pin");
const map = splice(MAP, surfaceMap(rows), "surface");
const check = process.argv.includes("--check");

if (check) {
  const stale = [];
  if (readFileSync(DOC, "utf8") !== doc) stale.push("docs/ui-pins.md");
  if (readFileSync(MAP, "utf8") !== map) stale.push("docs/ui-surface-map.md");
  if (stale.length) {
    console.error(`stale: ${stale.join(", ")} — run \`node scripts/ui-pins-doc.mjs\``);
    process.exit(1);
  }
  console.log(`ui-pins: ${rows.length} pins, both tables current`);
} else {
  writeFileSync(DOC, doc);
  writeFileSync(MAP, map);
  console.log(`ui-pins: wrote ${rows.length} pins into docs/ui-pins.md and docs/ui-surface-map.md`);
}
