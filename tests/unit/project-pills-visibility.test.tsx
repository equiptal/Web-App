import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { en } from "@/lib/i18n/en";
import { ProjectPills } from "@/components/create/ProjectPills";
import { renderCanvas } from "../setup/canvas";
import type { ProjectSummary } from "@/lib/contract/project";

/**
 * ── What earns a place on the pills strip (owner, 2026-09-02, refined 2026-09-12) ───────────────
 *
 * *"the rule is only show filled fields terms from the project or work order/request or show the
 * missing required fields ... but optional fields like year-night shift-etc if not filled already
 * they will not appear here."*, then *"keep it unless term is required in request to be sent"*.
 *
 * Two reasons a pill exists, and no third: it has a value, or the request cannot go out without it
 * and nobody has answered. Everything else stays in *More details* — drawing a dozen empty controls
 * turns a summary of what IS known into a form, and a renter reads past a form.
 *
 * ⚠️ **The YEAR changed sides, and the rule did not.** 09-02 named it as an example of an optional
 * term, and it was one then. `itemWebGaps` has refused a send without it since 2026-09-09
 * (`gate.yearMissing`, beside `gate.certMissing`), so under the SAME rule it now draws empty, with
 * the equipment certificate beside it. If the gate is ever lifted, both go back to `shown()`.
 */

const p = en.projects.pills;

/**
 * ⚠️ The strip returns null without a site, so a test that only asserts absence would pass on an
 * empty component and prove nothing. Every case here picks a project first.
 */
const SITE = {
  id: "p1",
  name: "Qiddiya Zone 4",
  location: { label: "Qiddiya, Riyadh", confirmed: true },
  defaults: { timing: { rentalBasis: "monthly", extendable: true, startDate: null, endDate: null, hoursPerDay: 10 }, paymentTerms: "net-30" },
} as unknown as ProjectSummary;

const draw = () => renderCanvas(<ProjectPills />, { prepare: (store) => store.actions.selectProject(SITE) });

describe("the optional terms nobody has answered", () => {
  it("Given a fresh draft, Then nights, the nationality and the operator's certificate are absent", async () => {
    /**
     * Each of these is a real question, and none of them is this strip's question. A renter who
     * wants to rule on night work opens *More details*; a renter who has not is not told about it
     * eleven times on a row he is reading to check what his SITE brought.
     */
    await draw();
    // The strip DID render — otherwise every absence below would be true of an empty component.
    expect(screen.getByText(p.site)).toBeTruthy();

    for (const label of [p.night, p.nationality, p.opCerts]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("Given a fresh draft, Then «nights» is absent rather than showing No", async () => {
    /**
     * ⚠️ `nightShift` is a BOOLEAN, so «unset» and «no» are different states. Coercing with `?? false`
     * drew *nights: No* as though the renter had ruled out night work he was never asked about — and
     * a supplier prices against that.
     */
    await draw();
    expect(screen.queryByText(p.night)).toBeNull();
    expect(screen.queryByText("nights")).toBeNull();
  });
});

describe("the terms a request cannot go out without", () => {
  it("Given nobody has answered them, Then they are drawn anyway, and empty", async () => {
    /**
     * Delivery, return and fuel responsibility are what every supplier must ask before he can price
     * anything. Absent, they are a question the renter never sees; red and empty, they are a question
     * he cannot miss.
     */
    await draw();
    expect(screen.getByText(p.delivery)).toBeTruthy();
    expect(screen.getByText(p.ret)).toBeTruthy();
    expect(screen.getByText(p.fuelResp)).toBeTruthy();
  });

  it("Given no template at all, Then the year and the equipment certificate are drawn too", async () => {
    /**
     * Both are gated (`gate.yearMissing` / `gate.certMissing`), and both used to live inside the
     * `terms &&` group — so a renter who picked a SITE and no template could not see, let alone
     * answer, either one here, while «Review & send» refused over them. `PATCH_TEMPLATE_TERMS`
     * starts a blank set for exactly this case, which is why they can sit outside that group.
     */
    await draw();
    expect(screen.getByText(p.year)).toBeTruthy();
    expect(screen.getByText(p.certs)).toBeTruthy();
  });
});

describe("naming the two certificates apart", () => {
  it("Given both certificate pills, Then each says which certificate it is", () => {
    // «Certificates» beside «operator cert» never said WHICH one it meant, on a row where the other
    // certificate is named explicitly.
    expect(p.certs).toBe("equipment cert");
    expect(p.opCerts).toBe("operator cert");
  });
});
