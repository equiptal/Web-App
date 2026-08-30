"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { DocPill, Field, FieldGrid, Section } from "@/components/PageSection";

/**
 * The verified company's own particulars — authority role, national ID, city, national address, and
 * the three documents that carry no number of their own.
 *
 * ── Why it moved (owner, 2026-08-26) ────────────────────────────────────────────────────────────
 * These facts were on `/profile`, in a green card, while `/company` showed the same firm's name,
 * roster and invite code. One subject, split across two pages by nothing more than which fetch each
 * page happened to make. The owner asked for the details, the code and sharing on ONE organization
 * page; this is the half that had to travel.
 *
 * It fetches `/api/verification` itself rather than being handed the data, because the company page
 * reads `/api/company` and the two answers come from different places. A section that owns its own
 * read cannot be mounted with the wrong company's papers.
 */

type CompanyInfo = {
  logoUrl: string | null;
  legalName: string | null;
  authorityRole: string | null;
  nationalId: string | null;
  companyCity: string | null;
  companyAddress: string | null;
  docs: { crDocUrl: string | null; vatDocUrl: string | null; nationalAddressDocUrl: string | null } | null;
};

export function CompanyDetails({ grow = false }: {
  /** Take the slack in this column, so the two columns of `/company` end level — see `Section.grow`.
   *  The papers can use the height: the space lands under the documents, inside the card. */
  grow?: boolean;
} = {}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const [info, setInfo] = useState<CompanyInfo | null>(null);

  /**
   * TWO reads, and they are separate on the server: the submission carries the particulars, and the
   * presigned document URLs come from `/verification/docs`, which 403s for a caller who is not
   * verified. So the second is allowed to fail on its own — the facts still print, the documents
   * just say «Verified» instead of offering a link.
   */
  useEffect(() => {
    let live = true;
    fetch("/api/verification", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { submission?: Record<string, string | null> } | null) => {
        if (!live || !d?.submission) return;
        const s = d.submission;
        setInfo((c) => ({
          logoUrl: s.companyLogoUrl ?? null,
          legalName: s.companyName ?? null,
          authorityRole: s.authorityRole ?? null,
          nationalId: s.nationalId ?? null,
          companyCity: s.companyCity ?? null,
          companyAddress: s.companyAddress ?? null,
          docs: c?.docs ?? null,
        }));
      })
      .catch(() => {});
    fetch("/api/verification/docs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { crDocUrl?: string | null; vatDocUrl?: string | null; nationalAddressDocUrl?: string | null } | null) => {
        if (!live || !d) return;
        setInfo((c) => ({
          logoUrl: c?.logoUrl ?? null,
          legalName: c?.legalName ?? null,
          authorityRole: c?.authorityRole ?? null,
          nationalId: c?.nationalId ?? null,
          companyCity: c?.companyCity ?? null,
          companyAddress: c?.companyAddress ?? null,
          docs: { crDocUrl: d.crDocUrl ?? null, vatDocUrl: d.vatDocUrl ?? null, nationalAddressDocUrl: d.nationalAddressDocUrl ?? null },
        }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!info) return null;

  const role = (r: string | null | undefined) => {
    const u = (r ?? "").toLowerCase();
    return u === "owner" ? L("Owner", "المالك") : u === "manager" ? L("Manager", "مدير") : u === "employee" ? L("Employee", "موظف") : r || null;
  };

  /**
   * Facts with a value to print, each with its own mark (owner's reference, 2026-08-26).
   *
   * Anything the backend did not send is dropped, not shown as «—»: a blank field on a verification
   * page reads as something missing rather than something absent. The icons are chosen to say what
   * KIND of fact each is at a glance — a name, a person, a number, a place — which is what lets four
   * of them sit in a 2×2 grid and still be told apart without reading the labels.
   */
  const facts = [
    { icon: "domain", label: L("Legal name", "الاسم النظامي"), value: info.legalName },
    { icon: "person", label: L("Authority role", "الصفة"), value: role(info.authorityRole) },
    { icon: "badge", label: L("National ID", "رقم الهوية"), value: info.nationalId },
    { icon: "location_on", label: L("City", "المدينة"), value: info.companyCity },
    { icon: "home_pin", label: L("National Address", "العنوان الوطني"), value: info.companyAddress },
  ].filter((f) => f.value);

  /** CR, VAT and the national-address certificate are FILES, not numbers — so the answer is a way to
   *  open one, and «Verified» only when the presigned URL did not come back. */
  const docs = [
    { label: L("CR document", "وثيقة السجل التجاري"), url: info.docs?.crDocUrl ?? null },
    { label: L("VAT document", "وثيقة الرقم الضريبي"), url: info.docs?.vatDocUrl ?? null },
    { label: L("National Address certificate", "شهادة العنوان الوطني"), url: info.docs?.nationalAddressDocUrl ?? null },
  ];

  /**
   * ── The papers are not fields (owner's reference, 2026-08-26) ─────────────────────────────────
   * All eight used to share one `FieldGrid`, so «CR document» sat in the same column shape as
   * «National ID» with the word «View» where a number belongs. A label/value pair answers *what is
   * it*; a document answers *here it is*. They are now two blocks in one card, divided by a
   * hairline — the facts above, the files below, each in the shape that suits it.
   */
  return (
    <Section title={t.profile.companyVerifiedTitle} grow={grow}>
      <FieldGrid>
        {facts.map((f) => (
          <Field key={f.label} icon={f.icon} label={f.label} value={f.value} />
        ))}
      </FieldGrid>

      <div className="border-t border-border px-4 pb-4 pt-3.5">
        <h3 className="mb-2 text-label font-semibold uppercase tracking-wide text-muted">{L("Documents", "المستندات")}</h3>
        {/* Two across, like the facts, so a card of three papers does not run down the page as three
            full-width bars. The odd one takes the leading column and the row simply ends. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {docs.map((d) => (
            <DocPill
              key={d.label}
              label={d.label}
              url={d.url}
              viewLabel={L("View", "عرض")}
              verifiedLabel={L("Verified", "موثَّق")}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}
