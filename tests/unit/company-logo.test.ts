import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The company logo, matched to the app** (owner, 2026-09-23: *"match it"*).
 *
 * The app keeps add, change and remove on one control, the tappable mark in the My Company header
 * (`apps/mobile/lib/features/company/presentation/widgets/company_logo_editor.dart`). These pin the
 * three rulings that carry over, all of which the web broke in a way no render test would catch:
 * the clear, the guard, and the gate.
 *
 * ⚠️ Read from the SOURCE. Two of the three are a single character of a condition, and the
 * third is a prop that is simply absent for a member. Rendering all of that would mock the profile
 * fetch, the company fetch, the upload and the presigned PUT to assert three lines.
 */

const SRC = resolve(__dirname, "../../src");
const route = readFileSync(resolve(SRC, "app/api/me/profile/route.ts"), "utf8");
const modal = readFileSync(resolve(SRC, "components/company/CompanyLogoModal.tsx"), "utf8");
const hub = readFileSync(resolve(SRC, "components/company/CompanyHub.tsx"), "utf8");
const profile = readFileSync(resolve(SRC, "components/profile/ProfileView.tsx"), "utf8");

/** Comments state the rules these cases enforce, so a naive `toContain` would match the prose. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the logo can be taken off again", () => {
  it("Given an EMPTY key, Then the proxy still forwards it", () => {
    /**
     * 🔴 **Three states, not two.** ~~`if (str(body.companyLogoKey))`~~ dropped an empty key,
     * and an empty key is the backend own clear (`input.companyLogoKey || null`, and what the app
     * sends from `_save(kind, key: '')`). So the web could set a mark once and never take it off:
     * the call went out without the field, the backend left the column alone, and the dialog
     * reported success over a logo that was still there.
     *
     * Absent means leave it alone, empty means remove it, a key means set it.
     */
    expect(code(route)).toContain('typeof body.companyLogoKey === "string"');
    expect(code(route)).not.toContain("if (str(body.companyLogoKey))");
  });

  it("Given a remove, Then it is asked for first and goes through the same PUT", () => {
    // One call writes and clears, so the two cannot drift apart. Clearing is destructive on every
    // surface the mark is printed on, so it is confirmed - the app asks too.
    expect(code(modal)).toContain('write("")');
    expect(code(modal)).toContain("setConfirming(true)");
    expect(code(modal)).toContain("companyLogoKey: logoKey");
  });
});

describe("a half-filled profile is told, not refused", () => {
  it("Given a name or a city missing, Then the picker is withheld with a reason", () => {
    /**
     * `updateProfileSchema` extends `completeProfileSchema` and makes all four names `min(2)`, and
     * there is no logo-only PUT - the four ride every call. Without this guard a renter who verified
     * a company before finishing his profile taps an ordinary-looking control and gets a raw 422.
     * `_blockedReason` / `_atLeastTwo` in the app, same four fields.
     */
    const c = code(modal);
    expect(c).toContain("two(profile.firstName)");
    expect(c).toContain("two(profile.lastName)");
    expect(c).toContain("two(profile.city)");
    expect(c).toContain("two(profile.jobTitle)");
    expect(c).toContain("p.logoNeedsProfile");
    // The guard is on the SAVE as well as the picker, because clearing is the same call.
    expect(c).toContain("disabled={!key || busy || blocked}");
  });
});

describe("the mark is the firm identity, and its owners act on it", () => {
  it("Given a MEMBER, Then the press is not handed down at all", () => {
    // `CompanyLogoEditor.isOwner`: a member sees the same avatar with no picker and no remove badge.
    // Withheld rather than disabled - a dead control on a card of plain facts reads as a fault.
    expect(code(hub)).toContain("onEdit={company.isOwner ? onEditLogo : undefined}");
  });

  it("Given no logo, Then only someone who can add one is told they can", () => {
    // The dashed edge is the add affordance, and `CompanyMark` draws it only on the button branch.
    const c = code(hub);
    expect(c).toContain("border-dashed border-brand/45");
    expect(c).toContain("logoUrl ? p.logoChange : p.logoAdd");
  });

  it("Given the profile page, Then it is the door that can CHANGE one", () => {
    /**
     * 🔴 Before this the only door was `?logo=1`, linked from the quotation and the deal room,
     * and both links carry `!companyLogoUrl` - so a renter who had a logo had no way to replace it
     * anywhere in the web. The app lets an owner tap the mark whatever is on file.
     */
    expect(code(profile)).toContain("onEditLogo={() => setLogoOpen(true)}");
    expect(code(profile)).toContain("logoUrl={profile?.companyLogoUrl ?? null}");
  });
});
