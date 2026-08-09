import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The chat card's chrome, as the cascade actually resolves it.**
 *
 * `ChatCard` renders two weights of one component (owner's ruling 2026-08-08): the request loop keeps
 * the full card, the negotiation vocabulary steps back to `.cc-quiet` — a transparent line whose ONLY
 * remaining distinction between an acceptance, a counter and an edit is the tone stripe on its
 * inline-start edge.
 *
 * That made the stripe load-bearing and then quietly deleted it. `.dlproto .chatcard.cc-quiet` set
 * `border-color: transparent` at (0,3,0); the tone rules set `border-inline-start-color` at (0,2,0).
 * Higher specificity wins, so the 2px stripe declared two lines below never painted — while the
 * comment above it said it survived, and tone appeared to survive only because the icon-colour rules
 * are (0,4,0).
 *
 * A comment cannot assert this and an eye cannot reliably catch it, so the cascade is resolved here:
 * for a real quiet card's class list, which rule *wins* the inline-start border colour.
 */

const CSS = readFileSync(resolve(process.cwd(), "src/components/deal-room/deal-room-proto.css"), "utf8");
const CHATCARD = readFileSync(resolve(process.cwd(), "src/components/deal-room/ChatCard.tsx"), "utf8");

/** Comments stripped; `@media`/`@keyframes` wrappers contribute no selector of their own. */
const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  selector: string;
  decls: string;
  order: number;
}

const RULES: Rule[] = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m, order) => ({
  selector: m[1].trim(),
  decls: m[2],
  order,
}));

const classesOf = (selector: string): string[] =>
  (selector.match(/\.[A-Za-z0-9_-]+/g) ?? []).map((c) => c.slice(1));

/**
 * Does this rule match an element carrying exactly `classList`, with no descendant/child structure
 * beyond the ancestor `.dlproto` these rules all hang off? Deliberately conservative: anything with a
 * pseudo-class, an attribute selector or a combinator we do not model is skipped rather than guessed
 * at, so a false "it paints" is not possible.
 */
function matches(selector: string, classList: Set<string>): boolean {
  if (selector.startsWith("@") || /[:[>~+]/.test(selector) || selector.includes(",")) return false;
  const parts = selector.trim().split(/\s+/);
  // `.dlproto` is the root the card lives under; every remaining part must be a compound on the card.
  if (parts[0] !== ".dlproto") return false;
  if (parts.length !== 2) return false;
  const cls = classesOf(parts[1]);
  return cls.length > 0 && cls.every((c) => classList.has(c));
}

/** These selectors are classes and descendant combinators only, so the class count IS the specificity. */
const specificity = (selector: string): number => classesOf(selector).length;

const colourToken = (value: string): string | null => {
  const tokens = value.trim().match(/var\([^)]*\)|#[0-9a-f]{3,8}|rgba?\([^)]*\)|transparent|currentcolor|[a-z-]+/gi) ?? [];
  // `1px solid var(--border)` → the colour is the last component, never the width or the style.
  const last = tokens[tokens.length - 1];
  return last ? last.toLowerCase() : null;
};

/** The inline-start border colour this one rule leaves behind, or null if it does not touch it. */
function stripeColourOf(decls: string): string | null {
  let colour: string | null = null;
  for (const decl of decls.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!value) continue;
    if (prop === "border" || prop === "border-inline-start") colour = colourToken(value);
    else if (prop === "border-color" || prop === "border-inline-start-color") colour = colourToken(value);
    // `border-block-color` / `border-inline-end-color` are the three edges that are NOT the stripe.
  }
  return colour;
}

/** Resolve the cascade for one element: highest specificity wins, later source order breaks the tie. */
function resolvedStripeColour(classList: string[]): { colour: string | null; selector: string | null } {
  const set = new Set(classList);
  let best: { rule: Rule; colour: string } | null = null;
  for (const rule of RULES) {
    if (!matches(rule.selector, set)) continue;
    const colour = stripeColourOf(rule.decls);
    if (colour == null) continue;
    if (
      !best ||
      specificity(rule.selector) > specificity(best.rule.selector) ||
      (specificity(rule.selector) === specificity(best.rule.selector) && rule.order > best.rule.order)
    ) {
      best = { rule, colour };
    }
  }
  return { colour: best?.colour ?? null, selector: best?.rule.selector ?? null };
}

/** Every quiet tone the component can emit, and the token its stripe must resolve to. */
const QUIET_TONES: [tone: string, token: string][] = [
  ["cc-rate", "var(--action)"],
  ["cc-accepted", "var(--success)"],
  ["cc-term-ok", "var(--success)"],
  ["cc-term-counter", "var(--warning)"],
  ["cc-term-edit", "var(--info)"],
  ["cc-term-reopen", "var(--muted)"],
];

describe("I3 — the quiet card's tone stripe actually paints", () => {
  it("parsed enough of the stylesheet to be worth asserting on", () => {
    expect(RULES.length).toBeGreaterThan(100);
    expect(RULES.some((r) => r.selector === ".dlproto .cc-rate")).toBe(true);
  });

  it.each(QUIET_TONES)("a quiet %s card resolves its stripe to %s, not transparent", (tone, token) => {
    const { colour, selector } = resolvedStripeColour(["dlproto", "chatcard", "cc-quiet", tone]);
    expect(colour, `winning rule: ${selector}`).toBe(token);
  });

  it("no rule matching a quiet card sets the stripe transparent at all", () => {
    // The specific defect: a shorthand on `.cc-quiet` outranking every tone rule at once. Asserting
    // the CLASS of mistake, not just its one instance, so re-adding `border-color` here reddens.
    const set = new Set(["dlproto", "chatcard", "cc-quiet", "cc-rate"]);
    const offenders = RULES.filter((r) => matches(r.selector, set) && stripeColourOf(r.decls) === "transparent");
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it("still removes the OTHER three borders, so the quiet weight is still quiet", () => {
    const quiet = RULES.find((r) => r.selector === ".dlproto .chatcard.cc-quiet");
    expect(quiet).toBeTruthy();
    expect(quiet!.decls).toMatch(/border-block-color:\s*transparent/);
    expect(quiet!.decls).toMatch(/border-inline-end-color:\s*transparent/);
    expect(quiet!.decls).toMatch(/background:\s*transparent/);
    // ...and the half-width stripe the comment promises is still declared.
    expect(quiet!.decls).toMatch(/border-inline-start-width:\s*2px/);
  });

  it("the prominent weight keeps the base card's full-width stripe", () => {
    const { colour } = resolvedStripeColour(["dlproto", "chatcard", "cc-ask"]);
    expect(colour).toBe("var(--action)");
  });
});

describe("I4 — every class the card emits is a class some stylesheet defines", () => {
  it("names no cc-* class that no rule defines", () => {
    // `cc-prominent` was emitted here and styled nowhere: the base `.chatcard` already IS the
    // prominent weight, so the class carried no meaning, only the appearance of one. Dead markup on
    // a shipped surface is worse than no markup — the next reader styles `.cc-quiet` and assumes its
    // opposite exists. The sweep reads the whole component, comments included, so a name that is
    // merely *talked about* without existing is caught too.
    //
    // Comments are stripped (prose may legitimately name a class it is explaining is gone), and so
    // are `cc-${view.tone}` / `cc-out-${view.outcomeTone}` — interpolations, not names; the tone
    // rules behind them are asserted above.
    const emitted = CHATCARD
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^[ \t]*\/\/.*$/gm, " ")
      .replace(/cc-[a-z0-9-]*\$\{[^}]*\}/g, " ");
    const named = new Set(
      [...emitted.matchAll(/\bcc-[a-z0-9-]*[a-z0-9]\b/g)].map((m) => m[0]).concat(["chatcard"]),
    );
    expect(named.size).toBeGreaterThan(10); // the sweep is not vacuous
    const defined = new Set(RULES.flatMap((r) => classesOf(r.selector)));
    expect([...named].filter((c) => !defined.has(c)).sort()).toEqual([]);
  });

  it("does not emit cc-prominent", () => {
    expect(CHATCARD).not.toMatch(/className=[^\n]*cc-prominent/);
    // The two weights are still two weights: `.cc-quiet` is the modifier, the bare card is the rest.
    expect(CHATCARD).toMatch(/`chatcard\$\{prominent \? "" : " cc-quiet"\} cc-\$\{view\.tone\}`/);
  });
});
