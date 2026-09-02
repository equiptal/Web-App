import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { WherePanel } from "@/components/create/WherePanel";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-19/20 — the site panel.
 *
 * The map itself is `next/dynamic`, so in jsdom it renders as nothing; that is fine, because the
 * assertions here are about the things around it — that confirmation is explicit, that it is
 * invalidated by a later edit, and that an unresolved text↔file disagreement is settled first. A
 * confirmed site with stale coordinates is a machine delivered to last week's job.
 */

const panel = (opts: Parameters<typeof renderCanvas>[1] = {}, complete = false) =>
  renderCanvas(<WherePanel open complete={complete} onToggle={() => {}} />, opts);

const unconfirmed = (over: Record<string, unknown> = {}) =>
  makeAgentDraft({
    items: [makeItem()],
    project: confirmedProject({ location: { label: "Site", lat: 24.7, lng: 46.7, confirmed: false, ...over } }),
  });

describe("confirming the site (MREQ-AC-29)", () => {
  it("offers the confirm button once coordinates exist", async () => {
    const handle = await panel({ draft: unconfirmed() });
    const button = screen.getByRole("button", { name: "This is the right spot" });
    expect(button.hasAttribute("disabled")).toBe(false);

    await handle.run(() => button.click());
    expect(handle.store().state.draft!.project.location.confirmed).toBe(true);
    expect(screen.queryByRole("button", { name: "This is the right spot" })).toBeNull();
  });

  it("will not let a label alone be confirmed — a typed name is not a location", async () => {
    await panel({
      draft: makeAgentDraft({
        items: [makeItem()],
        project: confirmedProject({ location: { label: "Somewhere in Riyadh", confirmed: false } }),
      }),
    });
    expect(screen.getByRole("button", { name: "This is the right spot" }).hasAttribute("disabled")).toBe(true);
  });

  it("invalidates the confirmation when the pin moves", async () => {
    const handle = await panel({ draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }) }, true);
    expect(handle.store().state.draft!.project.location.confirmed).toBe(true);

    await handle.run(() => handle.store().actions.patchLocation({ lat: 25.1, lng: 46.9, source: "map" }));

    expect(handle.store().state.draft!.project.location.confirmed).toBe(false);
    expect(screen.getByRole("button", { name: "This is the right spot" })).toBeTruthy();
  });
});

/**
 * A site saved as a typed ADDRESS, with no pin (owner, 2026-09-02).
 *
 * `ProjectForm` requires the label and nothing else, so this is an ordinary project — and it left
 * the panel in a dead end: the address in the header, no pin, and a confirm button that cannot be
 * pressed because `gateWhere` wants a point. The map now geocodes the site's own label and hands
 * back the point; the geocoder is Google's, so what is pinned here is the action it calls.
 */
describe("a site with an address and no pin", () => {
  const addressOnly = () =>
    makeAgentDraft({
      items: [makeItem()],
      project: confirmedProject({
        location: { label: "Qiddiya Zone 4, Riyadh", confirmed: false, source: "project" },
      }),
    });

  it("takes the point and leaves the label, the source and the confirmation alone", async () => {
    const handle = await panel({ draft: addressOnly() });
    expect(screen.getByRole("button", { name: "This is the right spot" }).hasAttribute("disabled")).toBe(true);

    await handle.run(() => handle.store().actions.pinProjectLocation(24.7136, 46.6753));

    const loc = handle.store().state.draft!.project.location;
    expect([loc.lat, loc.lng]).toEqual([24.7136, 46.6753]);
    // The site's own wording, not the geocoder's: a re-worded label reads as a MOVE off the site.
    expect(loc.label).toBe("Qiddiya Zone 4, Riyadh");
    expect(loc.source).toBe("project");
    // Still the renter's to confirm, and still the site's value: a pin nobody dragged is not a touch.
    expect(loc.confirmed).toBe(false);
    expect(handle.store().state.draft!.touchedFields ?? []).not.toContain("location.label");
    expect(screen.getByRole("button", { name: "This is the right spot" }).hasAttribute("disabled")).toBe(false);
  });

  it("cannot pull a renter back to the site's address once he has pinned his own", async () => {
    const handle = await panel({ draft: addressOnly() });
    await handle.run(() => handle.store().actions.patchLocation({ lat: 25.1, lng: 46.9, source: "map" }));

    // A slow geocode answering after the drag: ignored, or the marker jumps back under his hand.
    await handle.run(() => handle.store().actions.pinProjectLocation(24.7136, 46.6753));

    const loc = handle.store().state.draft!.project.location;
    expect([loc.lat, loc.lng]).toEqual([25.1, 46.9]);
  });
});

describe("a text↔file disagreement (MREQ-AC-31)", () => {
  it("asks which source is right, and hides the map until it is settled", async () => {
    const handle = await panel({ draft: unconfirmed({ conflict: { fromText: "Riyadh", fromFile: "Jeddah" } }) });

    expect(screen.getByText("Riyadh")).toBeTruthy();
    expect(screen.getByText("Jeddah")).toBeTruthy();
    // Confirming over an unresolved conflict would pick a site by accident, so the control is absent.
    expect(screen.queryByRole("button", { name: "This is the right spot" })).toBeNull();

    await handle.run(() => screen.getByText("Riyadh").closest("button")!.click());
    expect(handle.store().state.draft!.project.location.conflict!.resolvedFrom).toBe("text");
    expect(screen.getByRole("button", { name: "This is the right spot" })).toBeTruthy();
  });
});

describe("more than one site (MREQ-AC-30)", () => {
  it("says the others need their own request, and lists them", async () => {
    await panel({
      draft: makeAgentDraft({
        items: [makeItem()],
        project: confirmedProject(),
        detectedLocations: ["King Khalid Airport", "Jeddah Islamic Port"],
      }),
    });
    expect(screen.getByText("Jeddah Islamic Port")).toBeTruthy();
    expect(screen.getByText("King Khalid Airport")).toBeTruthy();
  });

  it("stays quiet for a single site", async () => {
    await panel({ draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject(), detectedLocations: ["Only one"] }) });
    expect(screen.queryByText("Only one")).toBeNull();
  });

  it("can be dismissed", async () => {
    const handle = await panel({
      draft: makeAgentDraft({
        items: [makeItem()],
        project: confirmedProject(),
        detectedLocations: ["A site", "Another site"],
      }),
    });
    expect(screen.getByText("Another site")).toBeTruthy();
    await handle.run(() => handle.store().actions.dismissMultiLocation());
    expect(screen.queryByText("Another site")).toBeNull();
  });

  it("opens a fresh request in a new tab for the other site", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const handle = await panel({
      draft: makeAgentDraft({
        items: [makeItem()],
        project: confirmedProject(),
        detectedLocations: ["A site", "Another site"],
      }),
    });
    await handle.run(() => screen.getByRole("button", { name: /separate request/i }).click());
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][1]).toBe("_blank");
  });
});
