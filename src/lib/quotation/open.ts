import type { QuotationRentee } from "@/lib/quotation/bid-quotation";

/**
 * The quotation's two browser ends, shared by the workspace's two download buttons: requests mode
 * (one machine's bids) and suppliers mode (one supplier's bids across requests, owner 2026-10-12).
 * Lifted out of `RequestsWorkspace` so the two papers carry the same letterhead and open the same way.
 */

/** The signed-in renter, best-effort: a refused `/api/me` costs the letterhead, not the quotation. */
export type MeUser = Record<string, string | null | undefined>;

export async function fetchMeUser(): Promise<MeUser> {
  const me = await fetch("/api/me", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ user?: MeUser }>) : null))
    .catch(() => null);
  return me?.user ?? {};
}

/** The renter's box on the paper, with the app's two asks (verify first, then the empty logo slot). */
export function quotationRentee(u: MeUser, verified: boolean, ar: boolean): QuotationRentee {
  const profileHref = `${window.location.origin}/profile`;
  return {
    companyName: u.companyName ?? "",
    personName: [u.firstName, u.lastName].filter(Boolean).join(" "),
    crNumber: u.crNumber ?? null,
    vatNumber: u.vatNumber ?? null,
    nationalAddress: u.nationalAddress ?? null,
    phone: u.phone ?? null,
    email: u.email ?? null,
    verified,
    logoUrl: u.companyLogoUrl ?? null,
    // Screen only; the PDF never carries them.
    asks: {
      verify: verified ? null : { href: `${profileHref}?verify=1`, label: ar ? "وثّق شركتك" : "Verify your company" },
      // Opens the logo dialog on the profile (`CompanyLogoModal`), the web's in-place upload.
      addLogo: verified && !u.companyLogoUrl ? { href: `${profileHref}?logo=1`, label: ar ? "أضف شعارًا" : "Add a logo" } : null,
    },
  };
}

/**
 * Opens the finished page in a new tab. A popup-blocked `window.open` returns null and used to fail
 * silently, a dead click, so it falls back to downloading the self-printing file.
 */
export function openQuotationPage(html: string, dlName: string): void {
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    return;
  }
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dlName.replace(/[^\w.-]+/g, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
