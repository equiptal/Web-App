import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { en } from "@/lib/i18n/en";
import { ProjectPills } from "@/components/create/ProjectPills";
import { renderCanvas } from "../setup/canvas";
import type { ProjectSummary } from "@/lib/contract/project";

/**
 * ── What earns a place on the pills strip (owner, 2026-09-02) ───────────────────────────────────
 *
 * *"the rule is only show filled fields terms from the project or work order/request or show the
 * missing required fields ... but optional fields like year-night shift-etc if not filled already
 * they will not appear here."*
 *
 * Two reasons a pill exists, and no third: it has a value, or the request cannot go out without it
 * and nobody has answered. Everything else stays in *More details* — drawing a dozen empty controls
 * turns a summary of what IS known into a form, and a renter reads past a form.
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
  it("Given a fresh draft, Then year, nights, nationality and the certificates are absent", async () => {
    /**
     * Each of these is a real question, and none of them is this strip's question. A renter who
     * wants to state a year opens *More details*; a renter who has not stated one is not told about
     * it eleven times on a row he is reading to check what his SITE brought.
     */
    await draw();
    // The strip DID render — otherwise every absence below would be true of an empty component.
    expect(screen.getByText(p.site)).toBeTruthy();

    for (const label of [p.year, p.night, p.nationality, p.opCerts, p.certs]) {
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

describe("the three a request cannot go out without", () => {
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
});

describe("naming the two certificates apart", () => {
  it("Given both certificate pills, Then each says which certificate it is", () => {
    // «Certificates» beside «operator cert» never said WHICH one it meant, on a row where the other
    // certificate is named explicitly.
    expect(p.certs).toBe("equipment cert");
    expect(p.opCerts).toBe("operator cert");
  });
});
