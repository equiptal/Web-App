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

const api = vi.hoisted(() => ({ assigned: [] as unknown[][], created: 0 }));

vi.mock("@/lib/api/client", () => ({
  listProjects: () => Promise.resolve([]),
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
});
afterEach(cleanup);

const draw = (hold: boolean) =>
  render(
    <LocaleProvider initialLocale="en">
      <ProjectFiled requestId="r-1" project={project} preferences={preferences} hold={hold} />
    </LocaleProvider>,
  );

describe("while the post is being announced", () => {
  it("files the request anyway — the write never waits for a dialog", async () => {
    draw(true);
    await waitFor(() => expect(api.assigned).toHaveLength(1));
    expect(api.assigned[0][0]).toBe("r-1");
    expect(api.created).toBe(1);
  });

  it("draws nothing, so the tick keeps the screen", async () => {
    const { container } = draw(true);
    await waitFor(() => expect(api.assigned).toHaveLength(1));
    expect(screen.queryByText(en.projects.offer.savedHeading)).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("appears the moment the hold is lifted, without filing twice", async () => {
    const { rerender } = draw(true);
    await waitFor(() => expect(api.assigned).toHaveLength(1));

    rerender(
      <LocaleProvider initialLocale="en">
        <ProjectFiled requestId="r-1" project={project} preferences={preferences} hold={false} />
      </LocaleProvider>,
    );
    expect(await screen.findByText(en.projects.offer.savedHeading)).toBeTruthy();
    // The effect is keyed on the request and the address, neither of which `hold` touches.
    expect(api.assigned).toHaveLength(1);
    expect(api.created).toBe(1);
  });
});

describe("with nothing else on screen", () => {
  it("reports the filing straight away, as it always did", async () => {
    draw(false);
    expect(await screen.findByText(en.projects.offer.savedHeading)).toBeTruthy();
    expect(api.assigned).toHaveLength(1);
  });
});
