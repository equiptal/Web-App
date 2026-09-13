import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { Dialog } from "@/components/Dialog";

/**
 * ── Sign in and create the account are ONE act (owner, 2026-09-13) ──────────────────────────────
 *
 * *"after the sign up or login modal it must open the create account for new users directly right?
 * like a user cant be guest after login"*, then *"make the login and create account as one step but
 * 2 modals, can't be done as 1 step only, check the prod main and align the logic"*.
 *
 * 🔴 **A user COULD be a guest after login, and prod was no better.** `guest` is a real backend
 * state - `getUserTier` in `profile.service.ts` returns it until `firstName && lastName && city &&
 * jobTitle` all exist - and Modal 2 was an ordinary dismissible dialog. Verify a code, press the ✕,
 * and the renter holds a session, a phone and nothing else: every tier-gated action refuses him.
 *
 * ⚠️ **`origin/main` was checked first, as asked, and it is the SAME code.** The routing
 * (`afterVerified` → `/api/me` → `setPhase("profile")`) is line for line identical there; the whole
 * main↔beta difference in this flow is the design-system pass plus a dropped `companyName` field.
 * Aligning to prod would have changed nothing, which is why this is a new rule rather than a port.
 */
const MODAL = readFileSync("src/components/onboarding/AccountModal.tsx", "utf8");
const FORM = readFileSync("src/components/onboarding/OnboardingForm.tsx", "utf8");
const DIALOG = readFileSync("src/components/Dialog.tsx", "utf8");

afterEach(cleanup);

describe("an undismissable dialog has no way out but its own body", () => {
  const draw = (dismissible: boolean, onClose = vi.fn()) => {
    const r = render(
      <Dialog open onClose={onClose} dismissible={dismissible}>
        <p>body</p>
      </Dialog>,
    );
    return { ...r, onClose };
  };

  it("by default every dialog in the app still closes three ways", () => {
    // The rule this app has kept: every layer has a way out. Only the signup opts out of it.
    const { onClose, container } = draw(true);
    expect(container.querySelector('[aria-label="Close"]')).toBeTruthy();
    fireEvent.click(container.querySelector("[data-dialog-scrim]")!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("`dismissible={false}` takes away the corner close, the scrim and Escape", () => {
    const { onClose, container } = draw(false);
    expect(container.querySelector('[aria-label="Close"]')).toBeNull();
    fireEvent.click(container.querySelector("[data-dialog-scrim]")!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the focus trap, which such a dialog needs MORE than an ordinary one", () => {
    // `useDialogKeys` still runs; only the close half of it is neutered.
    expect(DIALOG).toMatch(/useDialogKeys\(open, dismissible \? onClose : NOOP, panel\)/);
  });
});

describe("the second modal is the committed step", () => {
  it("the profile phase, and only it, locks the dialog", () => {
    // The keep/switch question is NOT committed: that account is already complete and both of its
    // buttons are answers, so there is nothing to trap anybody into.
    expect(MODAL).toMatch(/onCommitted\?\.\(phase === "profile"\)/);
    expect(MODAL).toMatch(/dismissible=\{!committed\}/);
  });

  it("leaving SIGNS OUT, which is the half that stops the guest", () => {
    /**
     * A phone-first renter already holds a session by the time this form is on screen. Closing
     * without signing out is precisely what left `+966566493886` stranded as a guest on 2026-09-10.
     * An email-first one has no account at all, so the call is harmless there.
     */
    const at = MODAL.indexOf("const abandon = async");
    expect(at).toBeGreaterThan(0);
    const body = MODAL.slice(at, at + 320);
    expect(body).toMatch(/status === "authed"/);
    expect(body).toMatch(/await signOut\(\)/);
    expect(body).toMatch(/onAbandon\(\)/);
  });

  it("and the form draws that control, named for what it does", () => {
    // «Leave and sign out», never «Cancel»: the code is verified and the session exists, so the
    // renter has to be told what stopping actually performs.
    expect(FORM).toMatch(/onAbandon && \(/);
    expect(FORM).toMatch(/\{o\.leave\}/);
  });

  it("the control is quiet, not a second button beside the act", () => {
    // Finishing is the thing to do here; two equal buttons would read as a real choice between them.
    const at = FORM.indexOf("{onAbandon && (");
    expect(FORM.slice(at, at + 400)).toMatch(/underline/);
    expect(FORM.slice(at, at + 400)).not.toMatch(/btn\(/);
  });
});

describe("the routing that was already right is left alone", () => {
  it("a new account still lands on the profile form", () => {
    // This was never the fault: `afterVerified` reads the authoritative tier and routes anything
    // below basic to Modal 2. The fault was that Modal 2 could be walked away from.
    expect(MODAL).toMatch(/const complete = tier === "basic" \|\| tier === "verified"/);
    expect(MODAL).toMatch(/setPhase\("profile"\)/);
  });

  it("an account that is already complete is still waved straight through", () => {
    expect(MODAL).toMatch(/if \(alreadyComplete\) onCreated\(\)/);
  });
});
