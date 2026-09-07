import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { en } from "@/lib/i18n/en";
import { ProfileView } from "@/components/profile/ProfileView";
import type { MyCompany } from "@/lib/contract/company";

/**
 * The firm lives on the profile now (owner, 2026-09-04).
 *
 * *"The my organization will be removed in the nav bar and we will not have it as separate page but
 * just part of user profile below his personal info."*
 *
 * So `/company` is gone, and these pin what took its place: the hub's own states render inside the
 * profile, under the renter's details, and nothing on the page still points at the retired route.
 */

const api = vi.hoisted(() => ({ company: null as MyCompany | null }));
vi.mock("@/lib/api/company-client", () => ({
  fetchMyCompany: () => Promise.resolve(api.company),
  validateInviteCode: () => Promise.resolve({ ok: false }),
  joinCompany: () => Promise.resolve({ ok: true }),
  cancelJoinRequest: () => Promise.resolve({ ok: true }),
  leaveCompany: () => Promise.resolve({ ok: true }),
  dissolveCompany: () => Promise.resolve({ ok: true }),
  approveMember: () => Promise.resolve({ ok: true }),
  removeMember: () => Promise.resolve({ ok: true }),
  promoteMember: () => Promise.resolve({ ok: true }),
  demoteMember: () => Promise.resolve({ ok: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams(),
}));

const member = (over: Partial<MyCompany> = {}): MyCompany => ({
  id: "c1",
  name: "Moedatech Contracting",
  legalName: null,
  isVerified: false,
  inviteCode: "AB12CD",
  myUserId: 7,
  myRole: "OWNER",
  myStatus: "ACTIVE",
  members: [],
  isOwner: true,
  isActive: true,
  activeMembers: [{ userId: 7, name: "Yara", phone: "+966501112233", role: "OWNER", status: "ACTIVE" } as never],
  pendingMembers: [],
  activeOwnerCount: 1,
  ...over,
});

beforeEach(() => {
  api.company = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/me")
        ? { user: { firstName: "Yara", lastName: "F", city: "Riyadh", jobTitle: "Procurement", email: "yara@moedatech.net", phone: "+966501112233", companyName: "Yesr Test", whatsapp: null }, verification: { status: "none" } }
        : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(cleanup);

/** `findByText` with room to breathe: the page runs two fetches before it can answer. */
const find = (text: string) => screen.findByText(text, {}, { timeout: 5000 });

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionProvider initialUser={{ id: 7, phone: "+966501112233", tier: "basic" } as any}>
        <ProfileView />
      </SessionProvider>
    </LocaleProvider>,
  );

describe("the organization, on the profile", () => {
  it("offers the join form under the renter's own details when he has no firm", async () => {
    draw();
    // The hub's no-company state, on this page: create your own, or join with a code.
    expect(await find(en.company.createOwnTitle)).toBeTruthy();
    expect(screen.getByText(en.company.joinTitle)).toBeTruthy();
    // And it really is BELOW the personal details, not above them.
    const profile = screen.getByText(en.profile.profileSection);
    const firm = screen.getByText(en.company.createOwnTitle);
    expect(profile.compareDocumentPosition(firm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the firm and the renter's role in it, without a second masthead", async () => {
    api.company = member();
    draw();
    expect(await find("Moedatech Contracting")).toBeTruthy();
    expect(screen.getAllByText("Moedatech Contracting")).toHaveLength(1);
    expect(screen.getByText(en.company.roleOwner)).toBeTruthy();
    // One masthead on the page: the person's. The firm's identity is a row inside the block.
    expect(document.querySelectorAll("header").length).toBeLessThanOrEqual(1);
  });

  it("keeps the roster, the invite code and the way out", async () => {
    api.company = member();
    draw();
    expect(await find(en.company.team)).toBeTruthy();
    expect(screen.getByText("AB12CD")).toBeTruthy();
    // Sole active member → the exit is «Dissolve», as it was on the page.
    expect(screen.getByText(en.company.dissolve)).toBeTruthy();
  });

  it("prints ONE company name, and it is the firm's", async () => {
    /**
     * Owner, 2026-09-07: *"how yesr test and EQ Rental, 2 names? which one."*
     *
     * Two different things were printed under one word: `profile.companyName` is free text typed at
     * signup, and the block below states the COMPANY the account belongs to — the record that
     * decides what he can see and what his bids are filed under. When both exist the firm wins.
     */
    api.company = member({ name: "EQ Rental" });
    draw();
    await find("EQ Rental");
    // Once, in the firm's own row — not again as a field of his personal details.
    expect(screen.getAllByText("EQ Rental")).toHaveLength(1);
    // And the typed leftover is not printed beside it.
    expect(screen.queryByText("Yesr Test")).toBeNull();
  });

  it("falls back to what he typed when there is no firm", async () => {
    // Then it is the only thing anyone has said about his company, so it stands.
    api.company = null;
    draw();
    await find(en.company.createOwnTitle);
    expect(screen.getByText("Yesr Test")).toBeTruthy();
  });

  it("points nothing at the retired /company route", async () => {
    api.company = member();
    draw();
    await find("Moedatech Contracting");
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/company");
  });
});
