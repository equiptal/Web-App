"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import {
  COMPANY_PILE_MAX_FILES,
  uploadCompanyPile,
  validateCompanyPileFile,
  type PileSession,
} from "@/lib/api/company-pile";
import { CompanyIdentityModal, type AuthorityRole, type CompanyIdentity } from "./CompanyIdentityModal";
import { CompanyDocsConfirmDialog } from "./CompanyDocsConfirmDialog";
import type { VerificationStatus } from "@/lib/contract/onboarding";
import { btn } from "@/lib/ds";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

// Fixed company-city list — mirrors the mobile app's 11-item dropdown exactly (value + EN/AR label).
// Values are the canonical English strings the app/back-end store, so web + mobile submissions match.
const VERIFY_CITIES: { value: string; en: string; ar: string }[] = [
  { value: "Riyadh", en: "Riyadh", ar: "الرياض" },
  { value: "Jeddah", en: "Jeddah", ar: "جدة" },
  { value: "Dammam", en: "Dammam", ar: "الدمام" },
  { value: "Mecca", en: "Mecca", ar: "مكة المكرمة" },
  { value: "Medina", en: "Medina", ar: "المدينة المنورة" },
  { value: "Khobar", en: "Khobar", ar: "الخبر" },
  { value: "Tabuk", en: "Tabuk", ar: "تبوك" },
  { value: "Abha", en: "Abha", ar: "أبها" },
  { value: "Jizan", en: "Jizan", ar: "جازان" },
  { value: "Hail", en: "Hail", ar: "حائل" },
  { value: "Other", en: "Other", ar: "أخرى" },
];

interface DocsOnFile {
  submitted: boolean;
  crDocUrl: string | null;
  vatDocUrl: string | null;
  nationalAddressDocUrl: string | null;
}

/**
 * Company verification — ONE unlabeled pile of documents (web-app/003 Flows 2/3).
 *
 * Replaces the six-slot labelled form, mirroring the mobile app's redesigned flow
 * (`company_docs_submission_page.dart`): the renter sends every company paper they have in one batch,
 * and RelayPanel's classifier + operators work out what each file is. The web asks only for what no
 * document can answer — authority role, and optionally national ID, city and a logo.
 *
 * Submitting is two calls, and the split matters:
 *   1. identity → `/api/verification/submit` (no document keys — that absence is what tells the
 *      backend this is a pile), which opens the verification and flips the renter to pending;
 *   2. the pile → presign, PUT each file, complete.
 *
 * ⚠️ **A failed upload must never navigate or re-read the status.** Step 1 has already flipped
 * `supplierStatus` to 1, so re-reading it renders the pending panel and the retry — which reuses the
 * presign session to re-send only the files that failed — becomes unreachable. Everything about the
 * failure path here is in service of keeping this screen mounted.
 */
export function VerificationFlow() {
  const t = useT();
  const v = t.verify;
  const p = v.pile;
  const { locale } = useLocale();
  const L = (e: string, a: string) => (locale === "ar" ? a : e);
  const router = useRouter();
  const { status: sessionStatus, tier } = useSession();

  const [status, setStatus] = useState<VerificationStatus | "loading">("loading");
  const [sent, setSent] = useState(false);

  // The pile, and what we know about the last attempt at sending it.
  const [files, setFiles] = useState<File[]>([]);
  const [failedIndexes, setFailedIndexes] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Presign session + "identity already accepted", both kept across a retry. Refs rather than state:
  // they are read inside the submit path and must never trigger a render of their own.
  const sessionRef = useRef<PileSession | undefined>(undefined);
  const identityDoneRef = useRef(false);

  const [identity, setIdentity] = useState<CompanyIdentity | null>(null);
  const [askIdentity, setAskIdentity] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);

  // Prefill + state, read once on mount.
  const [prefill, setPrefill] = useState<{
    role?: AuthorityRole | null;
    nationalId?: string | null;
    companyCity?: string | null;
    companyLogoKey?: string | null;
    companyLogoUrl?: string | null;
  }>({});
  /**
   * What the reviewer said, for a renter who is here because their last attempt was refused. Read
   * ONCE, like the app does: submitting flips the profile to pending, so re-reading it mid-flow would
   * pull the banner out from under someone who is still uploading.
   */
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocsOnFile | null>(null);

  // AC-08: verification is gated behind basic — a guest completes their profile first.
  useEffect(() => {
    if (sessionStatus === "authed" && tier === "guest") router.replace("/onboarding?next=/verify");
  }, [sessionStatus, tier, router]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/verification", { cache: "no-store" });
        if (!r.ok) {
          setStatus("none");
          return;
        }
        const d = (await r.json()) as {
          status: VerificationStatus;
          rejectionReason?: string | null;
          submission?: {
            authorityRole?: string | null;
            nationalId?: string | null;
            companyCity?: string | null;
            companyLogoKey?: string | null;
            companyLogoUrl?: string | null;
          };
        };
        setStatus(d.status);
        if (d.status === "rejected" && d.rejectionReason?.trim()) setRejectionReason(d.rejectionReason.trim());
        const s = d.submission;
        if (s) {
          const role =
            s.authorityRole === "owner" || s.authorityRole === "manager" || s.authorityRole === "employee"
              ? s.authorityRole
              : null;
          setPrefill({
            role,
            nationalId: s.nationalId,
            companyCity: s.companyCity,
            companyLogoKey: s.companyLogoKey,
            companyLogoUrl: s.companyLogoUrl,
          });
        }
      } catch {
        setStatus("none");
      }
    })();
  }, []);

  // What actually reached us. Readable by anyone who has submitted (pending / verified / rejected),
  // which is the whole point of the backend opening that read up — a renter under review otherwise has
  // no way to tell whether their documents landed.
  useEffect(() => {
    if (status !== "pending" && status !== "rejected") return;
    (async () => {
      try {
        const r = await fetch("/api/verification/docs", { cache: "no-store" });
        if (!r.ok) return;
        setDocs((await r.json()) as DocsOnFile);
      } catch {
        /* the panel simply doesn't render */
      }
    })();
  }, [status]);

  /** Any file leaving or joining the pile invalidates a presign we hold — it was for a different set. */
  const resetSession = () => {
    sessionRef.current = undefined;
    setFailedIndexes(new Set());
  };

  const addFiles = useCallback(
    (picked: FileList | File[] | null) => {
      const incoming = Array.from(picked ?? []);
      if (!incoming.length) return;
      setErr(null);
      for (const f of incoming) {
        const bad = validateCompanyPileFile(f);
        if (bad) {
          setErr(
            bad === "too_large"
              ? p.errors.tooLarge
              : bad === "empty"
                ? p.errors.empty
                : p.errors.unsupportedType,
          );
          return;
        }
      }
      setFiles((prev) => {
        const room = COMPANY_PILE_MAX_FILES - prev.length;
        if (room <= 0) {
          setErr(p.limitReached.replace("{count}", String(COMPANY_PILE_MAX_FILES)));
          return prev;
        }
        if (incoming.length > room) setErr(p.limitReached.replace("{count}", String(COMPANY_PILE_MAX_FILES)));
        return [...prev, ...incoming.slice(0, room)];
      });
      resetSession();
    },
    [p],
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setErr(null);
    resetSession();
  };

  // A tab can be reloaded out from under an upload in a way a phone screen cannot, so guard it.
  const inFlight = busy || failedIndexes.size > 0;
  useEffect(() => {
    if (!inFlight) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = p.unloadWarning;
      return p.unloadWarning;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [inFlight, p.unloadWarning]);

  /** identity (once) → pile. Called by the confirm dialog, and again by Send on a retry. */
  const send = async (id: CompanyIdentity) => {
    setBusy(true);
    setErr(null);
    try {
      if (!identityDoneRef.current) {
        const res = await fetch("/api/verification/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // No document keys, ever: their absence is what makes this a pile submission
          // (`isPileCompanySubmission`). One key here flips the backend into the labelled shape and it
          // then demands CR + VAT + a legal name.
          body: JSON.stringify({
            authorityRole: id.role,
            nationalId: id.nationalId,
            companyCity: id.companyCity,
            companyLogoKey: id.companyLogoKey,
          }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as {
            detail?: string;
            code?: string;
            backendCode?: string;
            messageAr?: string;
          };
          // CO1013 — a member of a company they do not own. The backend's copy is the clearest
          // statement of the rule (and is bilingual), so prefer it over ours.
          if (d.backendCode === "CO1013") {
            setErr((locale === "ar" ? d.messageAr : d.detail) || p.errors.memberCannotVerify);
            return;
          }
          setErr(d.code === "account_deleted" ? v.errors.accountDeleted : d.detail || v.errors.submit);
          return;
        }
        identityDoneRef.current = true;
      }

      const result = await uploadCompanyPile(files, sessionRef.current);
      sessionRef.current = result.session;
      if (!result.ok) {
        setFailedIndexes(result.failedIndexes);
        setErr(p.errors.partial);
        return;
      }
      setFailedIndexes(new Set());
      setSent(true); // AC-13 — terminal state, the form is gone
    } catch (e) {
      const reason = e instanceof Error ? e.message : "";
      setErr(
        reason === "offline"
          ? v.errors.offline
          : reason === "too_large"
            ? p.errors.tooLarge
            : reason === "unsupported_type"
              ? p.errors.unsupportedType
              : reason === "empty"
                ? p.errors.empty
                : reason === "too_many_files"
                  ? p.errors.tooMany.replace("{max}", String(COMPANY_PILE_MAX_FILES))
                  : p.errors.presign,
      );
    } finally {
      setBusy(false);
    }
  };

  /** The bottom CTA. A retry skips both popups — the answers are already held. */
  const onSend = () => {
    if (!files.length || busy) return;
    if (identity) {
      void send(identity);
      return;
    }
    setAskIdentity(true);
  };

  if (status === "loading") {
    return <div className="p-6 text-body text-muted">…</div>;
  }

  // Terminal state (the app uses a whole screen for the same reason): there is no way back into a
  // populated form, so a duplicate pile cannot be sent by pressing back.
  if (sent) {
    return (
      <StatePanel
        icon="mark_email_read"
        tone="ok"
        title={p.sentTitle}
        body={p.sentBody}
        homeLabel={t.onboarding.backToHome}
      />
    );
  }

  // AC-19 verified — terminal, no form.
  if (status === "verified") {
    return (
      <StatePanel
        icon="verified"
        tone="ok"
        title={v.verifiedTitle}
        body={v.verifiedBody}
        homeLabel={t.onboarding.backToHome}
      />
    );
  }

  // AC-13/14 pending — a waiting state with no action, but now with a read-only view of what arrived.
  if (status === "pending") {
    return (
      <div>
        <StatePanel icon="hourglass_top" tone="info" title={v.pendingTitle} body={v.pendingBody} />
        <DocsPanel docs={docs} p={p} />
        <div className="px-6 pb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-sm bg-navy px-5 py-2.5 text-body font-semibold text-white transition"
          >
            <Icon name="home" size={18} /> {t.onboarding.backToHome}
          </Link>
        </div>
      </div>
    );
  }

  // none → submit; rejected → resubmit, through the SAME endpoint (the app never calls resubmit for a
  // pile; `resubmitVerification` cannot run one — it stacks a second queue row and names it from a
  // legal name a pile never collects).
  return (
    <div>
      <div className="flex items-start gap-3 border-b border-border p-6">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-brand-soft text-brand">
          <Icon name="domain" size={22} />
        </span>
        <div>
          <h1 className="text-display font-extrabold text-navy">{p.title}</h1>
          <p className="mt-1 text-body text-muted">{v.subtitle}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6">
        {/* Above everything: the renter arrived from a Resubmit button, so the first thing on screen
            has to be what to fix — not the generic pitch for sending documents. */}
        {status === "rejected" &&
          (rejectionReason ? (
            <div className="rounded-sm border border-danger/30 bg-danger-soft px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-body font-extrabold text-danger">
                <Icon name="cancel" size={18} /> {p.rejectionLabel}
              </p>
              <p className="mt-1.5 text-body font-semibold text-navy">{rejectionReason}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-sm border border-danger/30 bg-danger-soft px-3.5 py-3 text-body font-semibold text-danger">
              <Icon name="error_outline" size={18} /> {v.rejectedBody}
            </div>
          ))}

        {/* Hero */}
        <div className="flex items-start gap-3 rounded-sm border border-info/25 bg-info-soft p-4">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full border border-info/25 bg-surface text-info">
            <Icon name="upload_file" size={22} />
          </span>
          <div>
            <p className="text-body font-extrabold text-navy">{p.heroTitle}</p>
            <p className="mt-1 text-meta text-muted">{p.heroSubtitle}</p>
          </div>
        </div>

        {/* Reference tiles — informational only, never tappable, and carrying no upload state: nothing
            is validated per document type in the browser, so a checkmark on one tile would be a false
            positive for every other the moment any file is added. */}
        <SectionHeader title={p.requiredSection} pill={p.requiredPill} tone="danger" />
        <div className="grid grid-cols-3 gap-2">
          <InfoTile icon="description" title={p.reqCr} />
          <InfoTile icon="location_on" title={p.reqNationalAddress} />
          <InfoTile icon="receipt_long" title={p.reqVat} />
        </div>

        {/* The one actionable control. */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`rounded-sm border-2 border-dashed p-5 text-center transition ${
            dragOver ? "border-brand bg-brand-soft" : "border-border bg-surface2"
          }`}
        >
          <Icon name="cloud_upload" size={26} className="text-brand" />
          <p className="mt-1 text-body font-semibold text-navy">{p.dropzoneTitle}</p>
          <p className="mx-auto mt-1 max-w-sm text-meta text-muted">{p.dropzoneSubtitle}</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || files.length >= COMPANY_PILE_MAX_FILES}
            className={btn("secondary", "md", { className: "mt-3" })}
          >
            <Icon name="add" size={16} />
            {files.length >= COMPANY_PILE_MAX_FILES
              ? p.limitReached.replace("{count}", String(COMPANY_PILE_MAX_FILES))
              : v.upload}
          </button>
          <p className="mt-2 text-label text-muted">
            {p.dropzoneHint.replace("{max}", String(COMPANY_PILE_MAX_FILES))}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="flex flex-col gap-2">
            {files.map((f, i) => {
              const failed = failedIndexes.has(i);
              return (
                <li
                  key={`${f.name}-${f.size}-${i}`}
                  className={`flex items-center gap-2.5 rounded-sm border px-3 py-2.5 ${
                    failed ? "border-danger/40 bg-danger-soft" : "border-border bg-surface"
                  }`}
                >
                  <Icon
                    name={failed ? "error_outline" : f.type === "application/pdf" ? "picture_as_pdf" : "image"}
                    size={18}
                    className={failed ? "text-danger" : "text-muted"}
                  />
                  <span className="min-w-0 flex-1 truncate text-body text-navy" title={f.name}>
                    {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={busy}
                    aria-label={p.remove}
                    className="grid h-7 w-7 flex-none place-items-center rounded-sm text-muted hover:bg-surface2 disabled:bg-disabled-bg disabled:text-disabled-fg"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <SectionHeader title={p.optionalSection} pill={p.optionalPill} tone="warn" />
        <div className="grid grid-cols-2 gap-2">
          <InfoTile icon="account_balance" title={p.optBank} />
          <InfoTile icon="flag" title={p.optLocalContent} />
          <InfoTile icon="military_tech" title={p.optQualifications} />
          <InfoTile icon="verified_user" title={p.optSaso} />
        </div>

        {/* What already reached us, for a renter who is resubmitting. */}
        {status === "rejected" && <DocsPanel docs={docs} p={p} compact />}

        {err && <p className="text-body font-semibold text-danger">{err}</p>}
      </div>

      <div className="border-t border-border p-6">
        <button
          type="button"
          onClick={onSend}
          disabled={busy || files.length === 0}
          className={btn("primary", "lg", { full: true, className: "flex transition" })}
        >
          {!busy && <Icon name={failedIndexes.size > 0 ? "refresh" : "send"} size={18} />}
          {busy ? v.submitting : p.submit}
        </button>
        {failedIndexes.size > 0 && !busy && (
          <p className="mt-2 text-center text-meta text-muted">
            {L(
              `${failedIndexes.size} of ${files.length} didn't upload — only those will be sent again.`,
              `${failedIndexes.size} من ${files.length} لم تُرفع — سيُعاد إرسالها فقط.`,
            )}
          </p>
        )}
      </div>

      <CompanyIdentityModal
        open={askIdentity}
        cities={VERIFY_CITIES}
        prefill={prefill}
        onCancel={() => setAskIdentity(false)}
        onContinue={(id) => {
          setIdentity(id);
          setAskIdentity(false);
          setAskConfirm(true);
        }}
      />
      <CompanyDocsConfirmDialog
        open={askConfirm}
        onCancel={() => setAskConfirm(false)}
        onConfirm={() => {
          setAskConfirm(false);
          if (identity) void send(identity);
        }}
      />
    </div>
  );
}

function SectionHeader({ title, pill, tone }: { title: string; pill: string; tone: "danger" | "warn" }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="text-body font-extrabold text-navy">{title}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-label font-extrabold ${
          tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
        }`}
      >
        {pill}
      </span>
    </div>
  );
}

function InfoTile({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-3 text-center">
      <span className="grid h-8 w-8 place-items-center rounded-sm bg-navy/5 text-navy">
        <Icon name={icon} size={18} />
      </span>
      <span className="text-label font-semibold leading-tight text-navy">{title}</span>
    </div>
  );
}

/**
 * The read-only side: which papers actually reached us. Shown to a renter under review (who has no
 * other way to tell) and to one who is resubmitting (who should see what was refused).
 */
function DocsPanel({
  docs,
  p,
  compact,
}: {
  docs: DocsOnFile | null;
  p: ReturnType<typeof useT>["verify"]["pile"];
  compact?: boolean;
}) {
  if (!docs) return null;
  const rows = [
    { label: p.docsOnFileCr, url: docs.crDocUrl },
    { label: p.docsOnFileVat, url: docs.vatDocUrl },
    { label: p.docsOnFileNationalAddress, url: docs.nationalAddressDocUrl },
  ].filter((r) => r.url);

  if (!rows.length) {
    return (
      <div className={compact ? "" : "px-6 pb-4"}>
        <div className="rounded-sm border border-border bg-surface2 px-3.5 py-3 text-center">
          <p className="text-body font-semibold text-navy">{p.noDocsTitle}</p>
          <p className="mt-1 text-meta text-muted">{p.noDocsBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "px-6 pb-4"}>
      <p className="mb-2 text-label font-semibold uppercase tracking-wide text-muted">{p.docsOnFileTitle}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center gap-2.5 rounded-sm border border-border bg-surface px-3 py-2.5"
          >
            <Icon name="description" size={18} className="text-muted" />
            <span className="min-w-0 flex-1 truncate text-body text-navy">{r.label}</span>
            <a
              href={r.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex-none rounded-sm border border-brand px-3 py-1 text-meta font-semibold text-brand"
            >
              {p.docsOnFileView}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatePanel({
  icon,
  tone,
  title,
  body,
  homeLabel,
}: {
  icon: string;
  tone: "ok" | "info";
  title: string;
  body: string;
  homeLabel?: string;
}) {
  return (
    <div className="p-10 text-center">
      <span
        className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${
          tone === "ok" ? "bg-ok-soft text-ok" : "bg-info-soft text-info"
        }`}
      >
        <Icon name={icon} size={28} />
      </span>
      <h1 className="mt-4 text-display font-extrabold text-navy">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-body text-muted">{body}</p>
      {/* Terminal state (sent/verified): the form is gone, so give the renter an explicit way home
          instead of leaving the browser back button as the only exit. */}
      {homeLabel && (
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-sm bg-navy px-5 py-2.5 text-body font-semibold text-white transition"
        >
          <Icon name="home" size={18} /> {homeLabel}
        </Link>
      )}
    </div>
  );
}
