import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { ProjectDelete } from "@/components/projects/ProjectDelete";
import type { ProjectSummary } from "@/lib/contract/project";

/**
 * PROJ-AC-02 — a project's delete confirmation names its creator.
 *
 * It matters because of AC-01: every member of a company sees and may act on every site in it, so
 * the site you are about to delete is often not yours. Deleting your own empty draft and deleting a
 * colleague's are the same two clicks, and this line is the only thing that tells them apart.
 */

const site = (over: Partial<ProjectSummary> = {}): ProjectSummary =>
  ({
    id: "p1",
    title: "Qiddiya Zone 4",
    location: { label: "Qiddiya", lat: null, lng: null },
    defaults: { timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null }, paymentTerms: null },
    version: 1,
    awards: { requests: {}, workOrderItems: {} },
    documents: [],
    ownerUserId: "46",
    ownerName: "Yara",
    requestCount: 0,
    workOrderCount: 0,
    unitsAwarded: 0,
    firstStart: null,
    lastEnd: null,
    ...over,
  }) as unknown as ProjectSummary;

function open(p: ProjectSummary) {
  return render(
    <LocaleProvider>
      <ProjectDelete project={p} open onClose={() => {}} onDelete={() => {}} />
    </LocaleProvider>,
  );
}

describe("the delete confirmation", () => {
  it("names the person who created the site (AC-02)", () => {
    cleanup();
    open(site());
    expect(screen.getByText(en.projects.del.createdBy.replace("{name}", "Yara"))).toBeTruthy();
  });

  it("says nothing rather than naming a person who does not exist", () => {
    /* An owner the backend cannot resolve is left unsaid. "Created by Unknown" reads as a person,
       and a renter would go looking for them. */
    cleanup();
    open(site({ ownerName: null }));

    const stem = en.projects.del.createdBy.split("{name}")[0].trim();
    expect(screen.queryByText(new RegExp(stem))).toBeNull();
  });

  it("still refuses, with an explanation, when the site is not empty", () => {
    // The creator line belongs to the confirmation. A site in use gets the busy panel instead.
    cleanup();
    open(site({ requestCount: 2 }));

    expect(screen.getByText(en.projects.del.busyTitle)).toBeTruthy();
    expect(screen.queryByText(en.projects.del.confirmAction)).toBeNull();
  });
});
