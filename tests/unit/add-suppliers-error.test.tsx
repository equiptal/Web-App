import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddSuppliersDialog } from "@/components/suppliers/AddSuppliersDialog";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

/**
 * ── The dialog says what the SERVER said (owner, 2026-09-12) ────────────────────────────────────
 *
 * A renter on beta could not add a supplier and sent a screenshot of «لم يُحفظ. صفوفك ما زالت هنا:
 * حاول مرة أخرى» — the dialog's `catch {}`, which fires for every non-2xx alike. Five different
 * failures reach it: the relay's 401 (no session), the handler's 404 («المستخدم غير موجود», his user
 * row is not in the tenant that Lambda reads), a 422 from the schema, a 500 from the unguarded
 * `createMany`, and a dropped connection. The screenshot could not tell them apart, and neither
 * could the source.
 *
 * The backend answers `message` + `messageAr` on every refusal. These pin that they reach the screen,
 * with the code and status beside them so the NEXT screenshot carries its own diagnosis.
 *
 * ⚠️ A per-row refusal is a different thing and keeps its own sentence: the endpoint answers 200 with
 * `rejected[]`, which `refusalLine` names row by row. Only a thrown request lands here.
 */

const AGENTS_404 = {
  success: false,
  error: { code: "NOT_FOUND", message: "User not found", messageAr: "المستخدم غير موجود" },
};

let reply: { body: unknown; status: number } = { body: AGENTS_404, status: 404 };

beforeEach(() => {
  reply = { body: AGENTS_404, status: 404 };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/renter-suppliers/bulk")) {
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(cleanup);

/**
 * ⚠️ `initialLocale` is not enough. `LocaleProvider` overrides it on mount — it restores the stored
 * choice, and failing that follows `navigator.language`, which is en-US under jsdom. The stored key
 * is what actually decides, exactly as `tests/setup/canvas.tsx` does it.
 */
const draw = (locale: "en" | "ar" = "en") => {
  window.localStorage.setItem("moedatech.locale", locale);
  return render(
    <LocaleProvider initialLocale={locale}>
      <AddSuppliersDialog open onClose={() => {}} onAdded={() => {}} />
    </LocaleProvider>,
  );
};

const firstRow = () => {
  const inputs = [...document.querySelectorAll<HTMLInputElement>("input:not([type='checkbox'])")];
  return { name: inputs[0], email: inputs[2], phone: inputs[3] };
};
const type = (el: HTMLInputElement, v: string) => fireEvent.change(el, { target: { value: v } });

/** A row the client rule accepts, so the press actually reaches the network. */
const fillOne = () => {
  const r = firstRow();
  type(r.name, "Al-Faisal Contracting Est.");
  type(r.phone, "0535869745");
};

const press = () => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    /^Add \d+ suppliers?$/.test((x.textContent ?? "").trim()) ||
    (x.textContent ?? "").trim() === en.suppliers.addOne ||
    (x.textContent ?? "").trim() === ar.suppliers.addOne,
  )!;
  fireEvent.click(b);
};

describe("a refused add names the refusal", () => {
  it("Given the backend's 404, Then its own sentence is on screen, not «try again»", async () => {
    draw();
    fillOne();
    press();
    await waitFor(() => expect(screen.getByText(/User not found/)).toBeTruthy());
    // The generic line is what this replaces; seeing it would mean the reason was dropped again.
    expect(screen.queryByText(en.suppliers.addFailed)).toBeNull();
  });

  it("Given Arabic, Then the backend's ARABIC sentence is used", async () => {
    draw("ar");
    fillOne();
    press();
    await waitFor(() => expect(screen.getByText(/المستخدم غير موجود/)).toBeTruthy());
  });

  it("Given any refusal, Then the code and status ride with it", async () => {
    /**
     * Not prose, and deliberately not translated: this is the part that makes a screenshot of the
     * dialog diagnostic. `NOT_FOUND · HTTP 404` separates the tenant lookup from the 500 on the
     * insert and from a stale session, which no amount of reading the source could.
     */
    draw();
    fillOne();
    press();
    await waitFor(() => expect(screen.getByText(/NOT_FOUND · HTTP 404/)).toBeTruthy());
  });

  it("Given a 500 the backend did not explain in Arabic, Then it still names the code", async () => {
    reply = {
      status: 500,
      body: { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to import suppliers" } },
    };
    draw();
    fillOne();
    press();
    await waitFor(() => expect(screen.getByText(/INTERNAL_ERROR · HTTP 500/)).toBeTruthy());
  });

  it("Given a body with no reason at all, Then the old sentence is the fallback", async () => {
    // A dropped connection, or an upstream that answered nothing readable. There is nothing to
    // report but the fact, so the renter gets the sentence that tells him his typing is safe.
    reply = { status: 502, body: {} };
    draw();
    fillOne();
    press();
    await waitFor(() => expect(screen.getByText(new RegExp(en.suppliers.addFailed))).toBeTruthy());
  });
});
