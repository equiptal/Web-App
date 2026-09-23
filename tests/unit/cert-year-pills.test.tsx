import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CertSelect } from "@/components/create/CertSelect";
import { SearchSelect } from "@/components/create/SearchSelect";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { itemFieldKey, itemWebGaps } from "@/lib/contract/gates";
import { defaultProjectDetails, type EquipmentItem, type RfqDraft } from "@/lib/contract/draft";

/**
 * **The certificate and the minimum year, in their three states** (owner, 2026-09-08).
 *
 * *"If not set at all then show them orange with pick certificate and pick min year, in warning
 * orange and not capitalised. Then if any value is selected by user or by the agent, fine, will be
 * filled and not shaken when the user tries to move. And in case the cert or year is selected by
 * agent, show another orange border around the box to indicate it is preselected — the same
 * indicator used in other request fields."*
 *
 * Three states, and the middle one had no mark of its own:
 *   · **unanswered** — orange, and the words are an instruction rather than a shouted noun
 *   · **answered by the renter** — the plain overlay skin, and the gate is satisfied
 *   · **answered FOR him** — the same skin plus the canvas's provenance ring
 *
 * Neither field is starred and neither ever was: MREQ-AC-54 keeps them optional to the REQUEST, so
 * they gate the canvas and are not the request's own requirements.
 */

const draw = (node: React.ReactNode) => render(<LocaleProvider initialLocale="en">{node}</LocaleProvider>);
const trigger = () => document.querySelector("button")!;
const box = () => trigger().parentElement!;

afterEach(cleanup);

/* The provenance mark: one thin line in the BRAND orange, as production draws it — it was
   `ring-warn/70` with an offset until 2026-09-08, and `--warn` in this palette is a mustard. */
const RING = "ring-brand";

describe("the certificate pill", () => {
  it("asks, in sentence case, when nothing is set", () => {
    draw(<CertSelect values={[]} touched={false} tone="brand" onChange={() => {}} />);
    expect(screen.getByText(en.create.machineCard.cert).textContent).toBe("Pick certificate");
    // Not a shouted noun: the string itself carries the case, so no `uppercase` class can undo it.
    expect(en.create.machineCard.cert).not.toBe(en.create.machineCard.cert.toUpperCase());
  });

  it("wears the palette's orange while unanswered, not its pressed shade", () => {
    // `brand-press` (#bd5711) is nearly a brown and read as a filled answer.
    draw(<CertSelect values={[]} touched={false} tone="brand" onChange={() => {}} />);
    expect(trigger().className).toContain("bg-brand");
    expect(trigger().className).not.toContain("bg-brand-press");
  });

  it("keeps the field's NAME for a screen reader", () => {
    // «Pick certificate, button» is an instruction read as a label; the name is the label.
    draw(<CertSelect values={[]} touched={false} tone="brand" onChange={() => {}} />);
    expect(trigger().getAttribute("aria-label")).toBe(en.create.machineCard.certName);
  });

  it("draws no ring for a value the renter chose himself", () => {
    draw(<CertSelect values={["tuv"]} touched tone="overlay" onChange={() => {}} />);
    expect(box().className).not.toContain(RING);
  });

  it("draws the provenance ring for a value the agent chose", () => {
    draw(<CertSelect values={["tuv"]} touched tone="overlay" preselected onChange={() => {}} />);
    expect(box().className).toContain(RING);
  });
});

describe("the minimum-year pill", () => {
  it("asks rather than labels, and keeps the name for the screen reader", () => {
    draw(
      <SearchSelect
        value={null}
        placeholder={en.create.machineCard.minYear}
        label={en.create.machineCard.minYearName}
        tone="brand"
        options={[{ value: "2024", label: "2024" }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Pick min year")).toBeTruthy();
    expect(trigger().getAttribute("aria-label")).toBe("Minimum year");
  });

  it("wears the palette's orange while unanswered", () => {
    draw(
      <SearchSelect value={null} placeholder="Pick min year" label="Minimum year" tone="brand" options={[]} onChange={() => {}} />,
    );
    expect(trigger().className).toContain("bg-brand");
    expect(trigger().className).not.toContain("bg-brand-press");
  });

  it("draws the provenance ring only when it was preselected", () => {
    const { rerender } = draw(
      <SearchSelect
        value="2024"
        placeholder="Pick min year"
        label="Minimum year"
        tone="overlay"
        options={[{ value: "2024", label: "2024" }]}
        onChange={() => {}}
      />,
    );
    expect(box().className).not.toContain(RING);
    rerender(
      <LocaleProvider initialLocale="en">
        <SearchSelect
          value="2024"
          placeholder="Pick min year"
          label="Minimum year"
          tone="overlay"
          preselected
          options={[{ value: "2024", label: "2024" }]}
          onChange={() => {}}
        />
      </LocaleProvider>,
    );
    expect(box().className).toContain(RING);
  });
});

/**
 * The half of the rule that is about MOVING ON: a value counts however it arrived.
 *
 * These read the gate's own predicates rather than the screen, because "does it shake" is decided
 * there — and the answer for an agent-filled field has to be no.
 */
describe("moving on", () => {
  /* A REQUEST with nothing answered at its level: the gate reads the resolved value now (the item's
     override, else the request's), so a draft with no project would read `undefined.advanced`
     (owner, 2026-09-09 — the fix for a filled certificate that shook). */
  const draft = (touchedFields: string[] = []) =>
    ({ touchedFields, project: defaultProjectDetails() }) as unknown as RfqDraft;
  const machine = (over: Partial<EquipmentItem>) =>
    ({
      id: "m1",
      ref: { categoryId: "c", subcategoryId: "s", measurementId: "z" },
      verdict: "ok",
      equipmentYear: null,
      safetyCertsOverride: [],
      ...over,
    }) as unknown as EquipmentItem;
  /** Which of the two fields the canvas would refuse to move past. */
  const blocked = (item: EquipmentItem, d: RfqDraft) =>
    itemWebGaps(item, d)
      .map((g) => g.field)
      .filter((f) => f === "equipment_year" || f === "safety_certificates");

  it("accepts a year and certs the AGENT set, with nothing touched", () => {
    // The rule’s own words, already in `gates.ts`: a value the agent extracted from the renter’s
    // RFQ IS his answer — he wrote it — so asking again asks the same question twice.
    expect(blocked(machine({ equipmentYear: "2024", safetyCertsOverride: ["tuv"] }), draft())).toEqual([]);
  });

  it("still refuses a field nobody has answered", () => {
    expect(blocked(machine({}), draft()).sort()).toEqual(["equipment_year", "safety_certificates"]);
  });

  it("accepts an explicit «any year» / «no certificate», which are answers with no value", () => {
    // `itemFieldKey` — the touch keys are `line_items[<id>].<field>`, not a dotted pair.
    const touched = draft([itemFieldKey("m1", "equipment_year"), itemFieldKey("m1", "safety_certificates")]);
    expect(blocked(machine({}), touched)).toEqual([]);
  });
});
