// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import type { ProjectDetails, Preferences } from "@/lib/contract/draft";

/**
 * **The project dialog queues behind the post, and the FILING does not** (owner, 2026-09-08: *"then
 * the project modal after them"*).
 *
 * Both dialogs mount on the same phase flip, so they raced for the screen and the renter met
 * whichever won — usually this one, in front of the tick that answers the button he pressed.
 *
 * The distinction these pin is the one that matters: `hold` holds the DIALOG and never the write. If
 * the filing waited too, a renter who closed the tab before reading the tick would end up with a
 * request filed under nothing — which is the silent bug `ProjectFiled` was written to fix.
 */

const api = vi.hoisted(() => ({
  assigned: [] as unknown[][],
  created: 0,
  /** What the renter already has. Each test that cares sets this before rendering. */
  projects: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/api/client", () => ({
  listProjects: () => Promise.resolve(api.projects),
  createProject: () => {
    api.created += 1;
    return Promise.resolve({
      id: "p-1",
      title: null,
      location: { label: "Riyadh, Saudi Arabia", lat: null, lng: null },
      version: 1,
    });
  },
  updateProject: () => Promise.resolve({}),
  assignToProject: (...args: unknown[]) => {
    api.assigned.push(args);
    return Promise.resolve({});
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { ProjectFiled } = await import("@/components/create/ProjectFiled");

const project = {
  location: { label: "Riyadh, Saudi Arabia", lat: null, lng: null },
  timing: { startDate: "2026-09-01", endDate: "2026-12-31", rentalBasis: "monthly", extendable: true },
} as unknown as ProjectDetails;
const preferences = { payment: { terms: "30 days" } } as unknown as Preferences;

beforeEach(() => {
  api.assigned = [];
  api.created = 0;
  api.projects = [];
  reported.length = 0;
});
afterEach(cleanup);

/** Every site handed up through `onFiled`, in order. */
const reported: Array<{ id: string }> = [];

const draw = (_unused: boolean = false, where: ProjectDetails = project) =>
  render(
    <LocaleProvider initialLocale="en">
      <ProjectFiled
        requestId="r-1"
        project={where}
        preferences={preferences}
        onFiled={(site) => reported.push(site)}
      />
    </LocaleProvider>,
  );

/** A request at a place, as the draft carries it. */
const at = (label: string, lat: number | null = null, lng: number | null = null) =>
  ({
    location: { label, lat, lng },
    timing: { startDate: "2026-09-01", endDate: "2026-12-31", rentalBasis: "monthly", extendable: true },
  }) as unknown as ProjectDetails;

/** A project the renter already has. */
const site = (id: string, label: string, lat: number | null = null, lng: number | null = null) => ({
  id,
  title: null,
  location: { label, lat, lng },
  version: 1,
});

/**
 * -- It files, and it draws nothing (owner, 2026-09-08) ------------------------------------------
 *
 * *"But we have now 2 competing modals, one for the post request success and one for the project...
 * I don't know how to show the 2 modals without distracting or overwhelming him."*
 *
 * 🔴 ~~Its own dialog, queued behind the post tick with a `hold` flag.~~ One press, two dialogs,
 * and the second arrived after the renter believed he had finished. The project is a block inside
 * the tick now, so this component does the WRITE and reports the site; `ShareOnPost` says it.
 */
describe("the filer", () => {
  it("files the request and reports the site it went into", async () => {
    draw();
    await waitFor(() => expect(api.assigned).toHaveLength(1));
    expect(api.assigned[0][0]).toBe("r-1");
    expect(api.created).toBe(1);
    expect(reported).toHaveLength(1);
    expect(reported[0].id).toBe("p-1");
  });

  it("renders nothing at all, whatever else is on screen", async () => {
    /**
     * 🔴 **The write must not wait for a dialog**, which is why this stayed a mounted component
     * rather than moving inside the tick. The filing happens on mount and the tick opens a moment
     * later, when the share has been handed off — so a renter who closes the tab in between still
     * has his request filed.
     */
    const { container } = draw();
    await waitFor(() => expect(api.assigned).toHaveLength(1));
    expect(container.textContent).toBe("");
    expect(screen.queryByText(en.projects.offer.savedHeading)).toBeNull();
    expect(screen.queryByText(en.projects.offer.viewAction)).toBeNull();
  });

  it("files once, however often the parent re-renders", async () => {
    // ⚠️ `onFiled` is read through a ref, so a parent passing an inline arrow cannot re-run the
    // effect and file the same request a second time.
    const { rerender } = draw();
    await waitFor(() => expect(api.assigned).toHaveLength(1));

    rerender(
      <LocaleProvider initialLocale="en">
        <ProjectFiled
          requestId="r-1"
          project={project}
          preferences={preferences}
          onFiled={(site) => reported.push(site)}
        />
      </LocaleProvider>,
    );
    expect(api.assigned).toHaveLength(1);
    expect(api.created).toBe(1);
    expect(reported).toHaveLength(1);
  });
});

/* ── Which requests get a project of their own (owner, 2026-09-08) ──────────────────── */

/**
 * *"For project auto creation, why do some requests create one and some not, while in different
 * locations?"*
 *
 * Because the match read only the text BEFORE THE FIRST COMMA (`shortSite`), and a map pin often
 * reverse-geocodes to nothing more than «Riyadh, Saudi Arabia» — so two sites a hundred kilometres
 * apart were one «place», the second request was filed under the first project, and no new project
 * appeared. It uses `leftTheSite` now: coordinates first at ~110 m, the full label otherwise.
 */
describe("one project per PLACE, not per first line of an address", () => {
  it("makes a second project for a different site whose label starts the same way", async () => {
    // The reported case. Both labels begin «Riyadh»; the pins are 40 km apart.
    api.projects = [site("p-old", "Riyadh, Saudi Arabia", 24.7136, 46.6753)];
    draw(false, at("Riyadh, Saudi Arabia", 24.4, 46.9));
    await waitFor(() => expect(api.created).toBe(1));
    expect(api.assigned[0][1]).not.toBe("p-old");
  });

  it("files under the existing project when the pin is the SAME site", async () => {
    // Re-geocoded wording, a nudged pin: about 30 m away, which is the same yard by any reading.
    api.projects = [site("p-old", "Qiddiya Zone 4, Riyadh 13513", 24.7136, 46.6753)];
    draw(false, at("Qiddiya Zone 4, Qiddiya City", 24.7138, 46.6755));
    await waitFor(() => expect(api.assigned).toHaveLength(1));
    expect(api.assigned[0][1]).toBe("p-old");
    expect(api.created).toBe(0);
  });

  it("falls back to the whole label when there are no coordinates", async () => {
    // A typed address. «Al Malqa District» is not «Al Malqa District, Second Ring» any more.
    api.projects = [site("p-old", "Al Malqa District, Riyadh")];
    draw(false, at("Al Malqa District, Second Ring Road, Riyadh"));
    await waitFor(() => expect(api.created).toBe(1));
    expect(api.assigned[0][1]).not.toBe("p-old");
  });

  it("still matches an identical typed address", async () => {
    api.projects = [site("p-old", "Al Malqa District, Riyadh")];
    draw(false, at("al malqa district,  riyadh"));
    await waitFor(() => expect(api.assigned).toHaveLength(1));
    expect(api.assigned[0][1]).toBe("p-old");
    expect(api.created).toBe(0);
  });

  it("does nothing at all when the draft has no address — which is a silent skip by design", async () => {
    // Worth pinning because it is the OTHER reason a request ends up with no project, and it is not
    // this rule: with no label there is no site to name, and the effect returns before any read.
    const { container } = draw(false, at(""));
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(api.created).toBe(0);
    expect(api.assigned).toHaveLength(0);
  });
});
