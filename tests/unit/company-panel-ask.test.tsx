/**
 * **Asking for company papers from the Company documents panel** (owner, 2026-10-12, option 3A:
 * «ask in the documents view, not only in the chat»).
 *
 * Reverses the 2026-08-08 «a company row is never requestable» (RM3-AC-72) wherever the host can
 * send the ask (`onAsk`). Without `onAsk` the panel is download-only, exactly as before. The two modes
 * never mix: the first tick decides, as on the equipment tab.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompanyPanel } from "@/components/map/panel/CompanyPanel";

const L = (en: string) => en;
const docs = { cr: { present: true, downloadUrl: "https://x/cr.pdf" } };

describe("the company panel's ask (option 3A)", () => {
  it("asks for the ticked missing papers, and only those", async () => {
    const onAsk = vi.fn();
    render(<CompanyPanel companyName="Al-Faisal" verified={false} docs={docs} ar={false} L={L} onBack={() => {}} onAsk={onAsk} />);
    await userEvent.click(screen.getByRole("button", { name: "Select VAT certificate" }));
    await userEvent.click(screen.getByRole("button", { name: "Select SASO registration" }));
    await userEvent.click(screen.getByRole("button", { name: "Ask the supplier (2)" }));
    expect(onAsk).toHaveBeenCalledWith(["vat", "saso"]);
  });

  it("never mixes: once a missing paper is ticked, a paper on file cannot be", async () => {
    render(<CompanyPanel companyName="Al-Faisal" verified={false} docs={docs} ar={false} L={L} onBack={() => {}} onAsk={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Select VAT certificate" }));
    expect((screen.getByRole("button", { name: "Select Commercial registration" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not offer a paper already asked for, and says it is waiting", () => {
    render(<CompanyPanel companyName="Al-Faisal" verified={false} docs={docs} ar={false} L={L} onBack={() => {}} onAsk={() => {}} asked={new Set(["vat"] as const)} />);
    expect(screen.queryByRole("button", { name: "Select VAT certificate" })).toBeNull();
    expect(screen.getByText("asked, awaiting reply")).toBeTruthy();
  });

  it("stays download-only without a host that can send the ask", () => {
    render(<CompanyPanel companyName="Al-Faisal" verified={false} docs={docs} ar={false} L={L} onBack={() => {}} />);
    expect(screen.queryByRole("button", { name: "Select VAT certificate" })).toBeNull();
    expect(screen.queryByText(/Ask the supplier/)).toBeNull();
  });
});
