"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { Field, FieldGrid, Section } from "@/components/PageSection";

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

export function CompanyDetails() {
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

  /** Facts with a value to print. Anything the backend did not send is dropped, not shown as «—»:
   *  a blank field on a verification page reads as something missing rather than something absent. */
  const facts = [
    { label: L("Legal name", "الاسم النظامي"), value: info.legalName },
    { label: L("Authority role", "الصفة"), value: role(info.authorityRole) },
    { label: L("National ID", "رقم الهوية"), value: info.nationalId },
    { label: L("City", "المدينة"), value: info.companyCity },
    { label: L("National Address", "العنوان الوطني"), value: info.companyAddress },
  ].filter((f) => f.value);

  /** CR, VAT and the national-address certificate are FILES, not numbers — so the answer is a way to
   *  open one, and «Verified» only when the presigned URL did not come back. */
  const docs = [
    { label: L("CR document", "وثيقة السجل التجاري"), url: info.docs?.crDocUrl ?? null },
    { label: L("VAT document", "وثيقة الرقم الضريبي"), url: info.docs?.vatDocUrl ?? null },
    { label: L("National Address certificate", "شهادة العنوان الوطني"), url: info.docs?.nationalAddressDocUrl ?? null },
  ];

  return (
    <Section title={t.profile.companyVerifiedTitle}>
      <FieldGrid>
        {facts.map((f) => (
          <Field key={f.label} label={f.label} value={f.value} />
        ))}
        {docs.map((d) => (
          <Field
            key={d.label}
            label={d.label}
            value={
              d.url ? (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                  <Icon name="visibility" size={14} /> {L("View", "عرض")}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-ok">
                  <Icon name="verified" size={13} /> {L("Verified", "موثَّق")}
                </span>
              )
            }
          />
        ))}
      </FieldGrid>
    </Section>
  );
}
