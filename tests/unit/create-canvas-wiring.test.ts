import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/**
 * **The canvas replaced the wizard — all of it.**
 *
 * A screen swap like this fails quietly in two directions, and neither shows up in a type-check, a
 * lint pass or a build:
 *
 *  - a new component nothing renders, which type-checks and styles perfectly while being invisible;
 *  - a surviving reference to the old four-step flow, which keeps a deleted concept alive in the
 *    codebase and reads to the next person as though steps still exist.
 *
 * The second is the one that matters here. The wizard's step model reached into the store (`step`,
 * `GO_STEP`, `goStep`), the gates (`gateStep1`–`3`) and the browser history, so a leftover in any of
 * them is a live path back to behaviour the canvas deliberately does not have.
 */

const CREATE_DIR = resolve(process.cwd(), "src/components/create");
const SRC = resolve(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const allSources = walk(SRC).map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

describe("the four-step wizard is gone", () => {
  it("has no wizard component directory", () => {
    expect(existsSync(resolve(process.cwd(), "src/components/wizard"))).toBe(false);
  });

  it("leaves no reference to the step model anywhere in src", () => {
    const dead = ["gateStep1", "gateStep2", "gateStep3", "goStep", "GO_STEP", "components/wizard"];
    for (const token of dead) {
      const hits = allSources.filter((f) => f.text.includes(token)).map((f) => basename(f.path));
      expect(hits, `"${token}" still referenced in ${hits.join(", ")}`).toEqual([]);
    }
  });
});

describe("every canvas component is rendered by something", () => {
  // CreateSurface is the entry point — the phase machine renders it, not another component.
  const ENTRY = new Set(["Canvas.tsx", "ReadyToSend.tsx"]);

  const files = readdirSync(CREATE_DIR).filter((f) => /\.tsx$/.test(f));

  it("finds the canvas directory populated", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} is referenced outside itself`, () => {
      const name = basename(file, ".tsx");
      const referrers = allSources
        .filter((f) => basename(f.path) !== file)
        .filter((f) => f.text.includes(`create/${name}`))
        .map((f) => basename(f.path));
      // Entry points are reached through CreateSurface; everything else through another component.
      expect(referrers.length, `${file} is imported by nothing`).toBeGreaterThan(0);
      if (ENTRY.has(file)) expect(referrers).toContain("CreateSurface.tsx");
    });
  }
});

describe("the canvas does not re-implement pricing", () => {
  // MREQ-AC-32 — the charged-day figure has exactly one source. A second implementation is how the
  // number shown at creation and the number billed later come to disagree.
  it("computes no duration or Friday arithmetic of its own", () => {
    const canvasFiles = walk(CREATE_DIR).map((p) => ({ path: p, text: readFileSync(p, "utf8") }));
    for (const f of [...canvasFiles, { path: "charged-days", text: readFileSync(resolve(SRC, "lib/contract/charged-days.ts"), "utf8") }]) {
      expect(f.text, `${basename(f.path)} does day arithmetic`).not.toMatch(/86_?400_?000/);
      expect(f.text, `${basename(f.path)} counts weekdays itself`).not.toMatch(/getDay\(\)|getUTCDay\(\)/);
    }
  });

  it("routes the figure through lib/pricing/rental", () => {
    const chargedDays = readFileSync(resolve(SRC, "lib/contract/charged-days.ts"), "utf8");
    expect(chargedDays).toContain("@/lib/pricing/rental");
    for (const fn of ["durationDaysBetween", "countFridays", "billableDays"]) {
      expect(chargedDays).toContain(fn);
    }
  });
});

describe("option lists come from the contract, not the prototype", () => {
  // The prototype invented CE, ISO 9001, a 2021+ year band and an "Any" operator certificate. Any of
  // them shipping would put a certificate requirement on a request that no supplier is asked to hold.
  it("contains none of the prototype's invented values", () => {
    // Comments are stripped first: the canvas files NAME the rejected values in their own doc blocks
    // to record why they were rejected, and that is documentation, not a leak.
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const canvas = walk(CREATE_DIR)
      .map((p) => stripComments(readFileSync(p, "utf8")))
      .join("\n");
    for (const invented of ["ISO 9001", "Aramco approved", "2021+", "Net 15", "Net 45"]) {
      expect(canvas, `prototype value "${invented}" leaked into the canvas`).not.toContain(invented);
    }
  });

  it("reads its vocabularies from options.ts", () => {
    const machine = readFileSync(join(CREATE_DIR, "MachineCard.tsx"), "utf8");
    for (const list of ["FUEL_TYPES", "EQUIPMENT_YEARS", "SAFETY_CERTIFICATES", "PARTIES"]) {
      expect(machine).toContain(list);
    }
    const operator = readFileSync(join(CREATE_DIR, "OperatorRail.tsx"), "utf8");
    expect(operator).toContain("OPERATOR_CERTIFICATES");
  });
});

describe("the agent's payment method is not read (MREQ-AC-44)", () => {
  it("never assigns payment.method from the agent header", () => {
    const adapters = readFileSync(resolve(SRC, "lib/api/agent-adapters.ts"), "utf8");
    expect(adapters).not.toMatch(/p\.payment\.method\s*=/);
    expect(adapters).not.toContain("h.payment_method");
  });
});
