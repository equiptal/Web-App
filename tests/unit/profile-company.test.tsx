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

const api = vi.hoisted(() => ({
  company: null as MyCompany | null,
  /** What `/api/me` reports for the verification, so a case can pick the app's status. */
  verification: "none" as string,
}));
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
  api.verification = "none";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/me")
        ? { user: { firstName: "Yara", lastName: "F", city: "Riyadh", jobTitle: "Procurement", email: "yara@moedatech.net", phone: "+966501112233", companyName: "Yesr Test", whatsapp: null }, verification: { status: api.verification } }
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
  it("asks the company question ONCE, in one card, with both answers in it", async () => {
    /**
     * 🔴 **The banner is gone** (owner, 2026-09-12: *"why ui is trash here, keep the create as part
     * of the company but show it nice and without ui bugs"*), which reverses the move made earlier
     * the same day (*"make one CTA for the verify"*).
     *
     * What that ruling protected SURVIVES — there is still exactly one place to press. What it
     * produced did not: a full-width slab whose own sentence pointed three hundred pixels down at
     * the card owning the other half of the same errand, and which was a `<button>` carrying a fake
     * CTA `<span>` styled as a second button.
     *
     * So: one card, headed by the QUESTION rather than by one of its two answers, holding «create»
     * above «join» in the app's own order.
     */
    draw();
    const head = await find(en.company.noneTitle);
    expect(head).toBeTruthy();
    expect(screen.getByText(en.company.createOwnCta)).toBeTruthy();
    // ⚠️ «Join a company» is no longer a HEADING here: it labelled a card that only joined, and the
    // card now asks the wider question. The join route is the invite-code field and its button.
    expect(screen.queryByText(en.company.joinTitle)).toBeNull();
    expect(screen.getByText(en.company.enterCode)).toBeTruthy();
    expect(screen.getByText(en.company.joinButton)).toBeTruthy();

    // ⚠️ The old slab's head is not drawn anywhere any more. Seeing it would mean two cards again.
    expect(screen.queryByText(en.company.createOwnTitle)).toBeNull();

    const profile = screen.getByText(en.profile.profileSection);
    // The card is BELOW the personal details, where the company block has always been.
    // eslint-disable-next-line no-bitwise
    expect(profile.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Given a firm, Then the verify CTA is not drawn at all", async () => {
    // ⚠️ No company is the gate, not the tier: verification is what CREATES a company, so an
    // account that has one has nothing left to ask for here.
    api.company = member();
    draw();
    await find("Moedatech Contracting");
    expect(screen.queryByText(en.company.createOwnCta)).toBeNull();
    expect(screen.queryByText(en.company.noneTitle)).toBeNull();
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

  it("prints BOTH names, each once, and tells them apart by their labels", async () => {
    /**
     * Owner, 2026-09-07: *"how yesr test and EQ Rental, 2 names? which one."* Then, 2026-09-22:
     * *"first i must view all fields here, why the company name not shown"*.
     *
     * 🔴 **The first ruling hid the wrong half.** He was right that two names under one word is
     * unreadable, and the answer taken then was to drop `profile.companyName` whenever a firm
     * existed. But this grid is the read-back of the edit form beside it, and since 2026-09-21 that
     * field is REQUIRED on the complete pass and is the fourth rung of the one naming rule — so a
     * field the form demands and the grid refuses to show reads as a field that failed to save.
     *
     * They are two facts and they are labelled as two: the DISPLAY name he typed on his profile,
     * and the firm's own row below. Same split the app keeps (`profile_form_page`: *"display/trade
     * company name — saved to the profile, NOT to verification"*).
     */
    api.company = member({ name: "EQ Rental" });
    draw();
    await find("EQ Rental");
    // The firm, once, in its own row — never repeated as a field of his personal details.
    expect(screen.getAllByText("EQ Rental")).toHaveLength(1);
    // And what he typed, once, under the Company label.
    expect(screen.getAllByText("Yesr Test")).toHaveLength(1);
    expect(screen.getByText(en.profile.companyName)).toBeTruthy();
  });

  it("falls back to what he typed when there is no firm", async () => {
    // Then it is the only thing anyone has said about his company, so it stands.
    api.company = null;
    draw();
    await find(en.company.noneTitle);
    expect(screen.getByText("Yesr Test")).toBeTruthy();
  });

  it("shows the firm and its people, and not the verification papers", async () => {
    /**
     * Owner, 2026-09-07: *"even in the company details don't show it — just show profile, company,
     * and the code with team members."* The particulars were a read-only copy of the form he filled
     * once; under his own details they turned the profile into a filing cabinet.
     */
    api.company = member();
    draw();
    await find(en.company.team);
    // The firm, the code and the roster — the three things he acts on.
    expect(screen.getByText("Moedatech Contracting")).toBeTruthy();
    expect(screen.getByText("AB12CD")).toBeTruthy();
    // Not the papers.
    expect(screen.queryByText(en.profile.companyVerifiedTitle)).toBeNull();
    expect(screen.queryByText(/Authority role|National ID/)).toBeNull();
  });

  it("points nothing at the retired /company route", async () => {
    api.company = member();
    draw();
    await find("Moedatech Contracting");
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/company");
  });
});

describe("the company's own particulars have a door", () => {
  /**
   * 🔴 **The app's split, on `supplierStatus`** (`company_profile_card._verificationSection`):
   * 1 / 2 / 3 open the READ-ONLY details; the FORM is offered only on 0 and 3. A submission under
   * review must not be sent a second time — *"sending again is what stacks a duplicate for the
   * reviewer"*. The web reads the same two endpoints the app reads (`/api/verification` for the
   * submission, `/api/verification/docs` for the presigned papers).
   */
  it("Given nothing submitted, Then there is nothing to read", async () => {
    api.company = member();
    draw();
    await find(en.company.team);
    expect(screen.queryByText(en.profile.companyDetails)).toBeNull();
  });

  for (const status of ["pending", "verified", "rejected"]) {
    it(`Given a ${status} submission, Then the details can be opened`, async () => {
      api.verification = status;
      api.company = member();
      draw();
      expect(await find(en.profile.companyDetails)).toBeTruthy();
    });
  }

  /**
   * ⚠️ The press is drawn WITHOUT a company row too. Verification is what CREATES the firm, so
   * between sending the papers and a reviewer approving them there is no company to hang it on —
   * and his own submission is the one thing he can still look at.
   */
  it("Given a submission and no firm yet, Then it is still there", async () => {
    api.verification = "pending";
    api.company = null;
    draw();
    expect(await find(en.profile.companyDetails)).toBeTruthy();
  });
});
