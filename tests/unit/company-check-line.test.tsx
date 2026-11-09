/**
 * The company documents check on the verification page (company doc check CC-12): the missing
 * papers and the warnings show under the pile, never red and never a gate, and the pile carries the
 * check's id to the presign. With no check (off, refused, failed) the page is exactly as before.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";
import { parseProgress } from "@/lib/upload-check/progress";
import type { CheckSnapshot } from "@/lib/upload-check/session";

const h = vi.hoisted(() => ({ check: null as CheckSnapshot | null, resume: vi.fn() }));

vi.mock("@/lib/session", () => ({ useSession: () => ({ tier: "basic", status: "authed" }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/upload-check/useCompanyCheck", () => ({
  useCompanyCheck: () => ({ check: h.check, resume: h.resume }),
}));

const { VerificationFlow } = await import("@/components/onboarding/VerificationFlow");
const { CompanyCheckLine, noteText } = await import("@/components/onboarding/CompanyCheckLine");

const CHECK = "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b";
const s = en.verify.pile.check;

const answered = (extra: Record<string, unknown> = {}): CheckSnapshot => ({
  mode: "on",
  checkId: CHECK,
  answered: true,
  timedOut: false,
  progress: parseProgress({
    checkId: CHECK,
    status: "done",
    updatedAt: "t1",
    files: [{ id: 0 }, { id: 1 }],
    papers: [
      { paper: "cr", state: "present" },
      { paper: "vat", state: "present" },
      { paper: "address", state: "missing" },
    ],
    notes: [],
    ...extra,
  }),
});

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

function stubNetwork() {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/verification") return reply(200, { status: "none" });
    if (u.endsWith("/presign"))
      return reply(200, { submissionId: "sub_1", uploads: [{ fileName: "cr.pdf", key: "k/0", url: "https://s3.test/0" }] });
    if (u.startsWith("https://s3.test/")) return reply(200, {});
    if (u.includes("/complete")) return reply(200, { ok: true });
    return reply(404, {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderWithFile() {
  const view = render(
    <LocaleProvider initialLocale="en">
      <VerificationFlow />
    </LocaleProvider>,
  );
  const input = await waitFor(() => {
    const el = view.container.querySelector('input[type="file"]');
    if (!el) throw new Error("form not there yet");
    return el as HTMLInputElement;
  });
  fireEvent.change(input, { target: { files: [new File(["x"], "cr.pdf", { type: "application/pdf" })] } });
  return view;
}

const sendButton = () => screen.getByRole("button", { name: /Send documents/ }) as HTMLButtonElement;

afterEach(() => {
  vi.unstubAllGlobals();
  h.check = null;
  h.resume.mockReset();
});

describe("the check on the verification page", () => {
  it("Given the switch on and a pile with CR and VAT, Then the page names the address as missing", async () => {
    stubNetwork();
    h.check = answered();
    await renderWithFile();
    expect(screen.getByText("We did not find National address, which is required to register")).toBeTruthy();
    expect(screen.getByText(s.missingSubOne)).toBeTruthy();
  });

  it("Given a note cr_on_platform, Then the warning shows and Send stays enabled", async () => {
    stubNetwork();
    h.check = answered({ notes: [{ code: "cr_on_platform", paper: "cr" }] });
    await renderWithFile();
    expect(screen.getByText(s.noteCrOnPlatform)).toBeTruthy();
    expect(sendButton().disabled).toBe(false);
  });

  it("Given a check, When the pile is sent, Then its id goes to the presign as scanAttemptId", async () => {
    const m = stubNetwork();
    h.check = answered();
    await renderWithFile();
    fireEvent.click(sendButton());
    expect(h.resume).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en.verify.pile.confirmSubmit }));
    await waitFor(() => expect(screen.getByText(en.verify.pile.sentTitle)).toBeTruthy());
    const presign = m.mock.calls.find(([u]) => String(u).endsWith("/presign"))!;
    expect(JSON.parse(String((presign[1] as RequestInit).body)).scanAttemptId).toBe(CHECK);
  });

  it("Given the check failing (no check), Then no line and the send still works, with no check id", async () => {
    const m = stubNetwork();
    h.check = null;
    const view = await renderWithFile();
    expect(view.container.querySelector('[data-testid="company-check"]')).toBeNull();
    expect(screen.queryByText(s.checking)).toBeNull();
    fireEvent.click(sendButton());
    fireEvent.click(screen.getByRole("button", { name: en.verify.pile.confirmSubmit }));
    await waitFor(() => expect(screen.getByText(en.verify.pile.sentTitle)).toBeTruthy());
    const presign = m.mock.calls.find(([u]) => String(u).endsWith("/presign"))!;
    expect(JSON.parse(String((presign[1] as RequestInit).body))).not.toHaveProperty("scanAttemptId");
  });
});

describe("CompanyCheckLine", () => {
  it("Given a check still reading, Then the grey checking line; past its budget, nothing", () => {
    const running: CheckSnapshot = { mode: "on", checkId: CHECK, answered: false, timedOut: false, progress: null };
    const { rerender } = render(<CompanyCheckLine check={running} s={s} locale="en" />);
    expect(screen.getByText(s.checking)).toBeTruthy();
    rerender(<CompanyCheckLine check={{ ...running, timedOut: true }} s={s} locale="en" />);
    expect(screen.queryByText(s.checking)).toBeNull();
  });

  it("Given a failed check, Then nothing", () => {
    const { container } = render(<CompanyCheckLine check={answered({ status: "failed" })} s={s} locale="en" />);
    expect(container.textContent).toBe("");
  });

  it("Given only an unknown note code and nothing missing, Then nothing shows and nothing breaks", () => {
    const check = answered({
      papers: [{ paper: "cr", state: "not_checked" }],
      notes: [{ code: "from_a_later_server", paper: "cr" }],
    });
    const { container } = render(<CompanyCheckLine check={check} s={s} locale="en" />);
    expect(container.textContent).toBe("");
  });

  it("Given two missing papers, Then both are named in one line", () => {
    const check = answered({
      papers: [
        { paper: "cr", state: "present" },
        { paper: "vat", state: "missing" },
        { paper: "address", state: "missing" },
      ],
    });
    render(<CompanyCheckLine check={check} s={s} locale="en" />);
    expect(
      screen.getByText("We did not find VAT registration certificate and National address, which are required to register"),
    ).toBeTruthy();
  });

  it("words every note in EN and AR, the date Gregorian with Latin digits, no trailing period", () => {
    const notes = [
      { code: "expired", paper: "cr", date: "2026-03-12" },
      { code: "unclear_number", paper: "vat", date: null },
      { code: "name_mismatch", paper: null, date: null },
      { code: "cr_on_platform", paper: "cr", date: null },
      { code: "file_seen_elsewhere", paper: "address", date: null },
    ] as const;
    const enText = notes.map((n) => noteText(n, s, "en"));
    expect(enText[0]).toBe("Your commercial registration seems to have expired on 12 Mar 2026. Upload the renewed one if you have it");
    expect(enText[1]).toBe("We could not read the VAT registration certificate number clearly. A clearer photo helps");
    const arText = notes.map((n) => noteText(n, ar.verify.pile.check, "ar"));
    expect(arText[0]).toContain("السجل التجاري");
    expect(arText[0]).toMatch(/12/);
    expect(arText[0]).toContain("2026");
    for (const t of [...enText, ...arText]) {
      expect(t.endsWith(".")).toBe(false);
      expect(t).not.toContain("—");
      expect(t).not.toMatch(/\{(paper|date)\}/);
    }
  });
});
