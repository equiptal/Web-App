"use client";

import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { VerificationStatus } from "@/lib/contract/onboarding";

// Reuse the 002 Google Maps picker for the optional company location (AC-15).
const MapPicker = dynamic(() => import("@/components/shared/GoogleMapLocationPicker"), { ssr: false });

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
// Company-logo uploader. apps/backend now supports companyLogoKey on staging (companyDetailsSchema
// accepts it; profile.service persists it + returns a presigned companyLogoUrl), and the agents
// bid-form already renders the renter's logo from it — so the gate is lifted.
const LOGO_UPLOAD_ENABLED = true;
const inputCls =
  "h-[46px] w-full rounded-[10px] border border-border bg-surface px-[14px] text-[14px] outline-0 focus:border-brand focus:shadow-[0_0_0_3px_rgba(247,144,9,.12)]";
const labelCls = "mb-[6px] block text-[12.5px] font-bold text-navy-mid";

/** One presigned document upload: pick → /api/profile/doc-upload-url → PUT to S3 → hold the key. */
function DocUpload({
  label,
  required,
  docKey,
  onKey,
  onError,
}: {
  label: string;
  required?: boolean;
  docKey: string | null;
  onKey: (key: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const pick = async (file: File) => {
    setBusy(true);
    onError(null);
    try {
      const r = await fetch("/api/profile/doc-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { code?: string };
        throw new Error(d.code === "validation" ? t.verify.errors.docType : t.verify.errors.submit); // AC-11
      }
      const { url, key } = (await r.json()) as { url: string; key: string };
      const put = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error(t.verify.errors.submit);
      setName(file.name);
      onKey(key);
    } catch (e) {
      onError(e instanceof Error ? e.message : t.verify.errors.submit);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className={labelCls}>
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <label className="flex cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-dashed border-border bg-surface2 px-[14px] py-3 text-[13px] hover:border-brand">
        <span className="truncate text-muted">{name ?? (docKey ? t.verify.uploaded : t.verify.upload)}</span>
        <span className="inline-flex items-center gap-1 font-bold text-brand">
          {busy ? <Icon name="hourglass_empty" size={16} /> : docKey || name ? <Icon name="check_circle" size={16} className="text-ok" /> : <Icon name="upload" size={16} />}
          {busy ? t.verify.uploading : docKey || name ? t.verify.uploaded : t.verify.upload}
        </span>
        <input
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
      </label>
    </div>
  );
}

type Role = "owner" | "manager" | "employee";

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

/**
 * Verification flow (web-app/003 Flows 2/3, AC-08–20). Reads status from `/api/verification`; routes
 * a guest to onboarding first (AC-08); shows verified/pending states or the (re)submit form. Submits
 * to `/api/verification/submit` (or `/resubmit` when rejected) → pending.
 */
export function VerificationFlow() {
  const t = useT();
  const v = t.verify;
  const { locale } = useLocale();
  const L = (e: string, a: string) => (locale === "ar" ? a : e);
  const router = useRouter();
  const { status: sessionStatus, tier } = useSession();

  const [status, setStatus] = useState<VerificationStatus | "loading">("loading");
  const [role, setRole] = useState<Role>("owner");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [crDocKey, setCrDocKey] = useState<string | null>(null);
  const [vatDocKey, setVatDocKey] = useState<string | null>(null);
  const [nationalAddressDocKey, setNationalAddressDocKey] = useState<string | null>(null);
  const [localContentDocKey, setLocalContentDocKey] = useState<string | null>(null);
  const [sasoHeavyEquipDocKey, setSasoHeavyEquipDocKey] = useState<string | null>(null);
  const [otherDocKeys, setOtherDocKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [showLoc, setShowLoc] = useState(false); // optional company map — collapsed by default to keep the form short
  const [companyLogoKey, setCompanyLogoKey] = useState<string | null>(null); // S3 key (sent to backend)
  const [logoPreview, setLogoPreview] = useState<string | null>(null); // presigned URL (existing) or local preview (just picked)
  const [logoBusy, setLogoBusy] = useState(false);

  // Resize the picked image to a small PNG (≤220px), then upload it via the field-agnostic
  // doc-upload-url flow (same as CR/VAT/etc.) and hold the returned KEY. We send `companyLogoKey`
  // on submit; the backend stores it on the profile and the bid form presigns it for display.
  const onPickLogo = (file: File) => {
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 220;
        let { width, height } = img;
        if (width >= height && width > max) { height = Math.round((height * max) / width); width = max; }
        else if (height > width && height > max) { width = Math.round((width * max) / height); height = max; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setLogoBusy(true);
          try {
            const r = await fetch("/api/profile/doc-upload-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: "company-logo.png", contentType: "image/png" }),
            });
            if (!r.ok) throw new Error(v.errors.submit);
            const { url, key } = (await r.json()) as { url: string; key: string };
            const put = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": "image/png" } });
            if (!put.ok) throw new Error(v.errors.submit);
            setCompanyLogoKey(key);
            setLogoPreview(canvas.toDataURL("image/png"));
          } catch (e) {
            setErr(e instanceof Error ? e.message : v.errors.submit);
          } finally {
            setLogoBusy(false);
          }
        }, "image/png");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // AC-08: verification is gated behind basic — a guest is routed to complete their profile first.
  useEffect(() => {
    if (sessionStatus === "authed" && tier === "guest") router.replace("/onboarding?next=/verify");
  }, [sessionStatus, tier, router]);

  // Load current verification status + prefill (AC-14/17/18/19/20).
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
          submission?: {
            authorityRole?: string | null;
            companyName?: string | null;
            companyLegalName?: string | null;
            nationalId?: string | null;
            companyCity?: string | null;
            companyAddress?: string | null;
            companyLat?: number | null;
            companyLng?: number | null;
            nationalAddressDocKey?: string | null;
            localContentDocKey?: string | null;
            sasoHeavyEquipDocKey?: string | null;
            companyLogoKey?: string | null;
            companyLogoUrl?: string | null;
          };
        };
        setStatus(d.status);
        const s = d.submission;
        if (s) {
          if (s.authorityRole === "owner" || s.authorityRole === "manager" || s.authorityRole === "employee") setRole(s.authorityRole);
          // Old accounts may only have companyName — fall back to it as the legal name (app parity).
          setCompanyLegalName(s.companyLegalName ?? s.companyName ?? "");
          setNationalId(s.nationalId ?? "");
          setCompanyCity(s.companyCity ?? "");
          setCompanyAddress(s.companyAddress ?? "");
          if (typeof s.companyLat === "number" && typeof s.companyLng === "number") setLoc({ lat: s.companyLat, lng: s.companyLng });
          setNationalAddressDocKey(s.nationalAddressDocKey ?? null);
          setLocalContentDocKey(s.localContentDocKey ?? null);
          setSasoHeavyEquipDocKey(s.sasoHeavyEquipDocKey ?? null);
          setCompanyLogoKey(s.companyLogoKey ?? null);
          setLogoPreview(s.companyLogoUrl ?? null);
        }
      } catch {
        setStatus("none");
      }
    })();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const next_fe: Record<string, string> = {};
    // App/backend parity: only the legal name is required on verification; companyName is the optional
    // display/trade name (set on the profile form, companyDetailsSchema.companyName is optional).
    if (companyLegalName.trim().length < 2 || companyLegalName.trim().length > 200) next_fe.companyLegalName = v.errors.companyLegalName;
    if (!crDocKey) next_fe.cr = v.errors.cr;
    if (!vatDocKey) next_fe.vat = v.errors.vat;
    if (!nationalAddressDocKey) next_fe.nationalAddress = v.errors.nationalAddress; // required to match the app (company_verification_page.dart:302)
    if (Object.keys(next_fe).length) {
      setFe(next_fe);
      return;
    }
    setFe({});
    setBusy(true);
    const path = status === "rejected" ? "/api/verification/resubmit" : "/api/verification/submit";
    let res: Response;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorityRole: role,
          companyLegalName: companyLegalName.trim(),
          crDocKey,
          vatDocKey,
          nationalId: nationalId.trim() || undefined,
          companyCity: companyCity.trim() || undefined,
          companyAddress: companyAddress.trim() || undefined,
          companyLat: loc?.lat,
          companyLng: loc?.lng,
          nationalAddressDocKey: nationalAddressDocKey || undefined,
          localContentDocKey: localContentDocKey || undefined,
          sasoHeavyEquipDocKey: sasoHeavyEquipDocKey || undefined,
          otherDocKeys: otherDocKeys.length ? otherDocKeys : undefined,
          companyLogoKey: companyLogoKey || undefined, // company logo key → stored on the profile, presigned + shown on the bid form
        }),
      });
    } catch {
      setBusy(false);
      setErr(v.errors.offline); // AC-23
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { detail?: string };
      setErr(d.detail || v.errors.submit);
      return;
    }
    setStatus("pending"); // AC-13
  };

  if (status === "loading") {
    return <div className="p-[22px] text-sm text-muted">…</div>;
  }

  // AC-19 verified / AC-13-14/20 pending — terminal states, no form.
  if (status === "verified") {
    return (
      <StatePanel icon="verified" tone="ok" title={v.verifiedTitle} body={v.verifiedBody} />
    );
  }
  if (status === "pending") {
    return <StatePanel icon="hourglass_top" tone="info" title={v.pendingTitle} body={v.pendingBody} />;
  }

  // none → submit; rejected → resubmit (AC-17/18), with a generic banner (no reason, AC-17).
  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-start gap-3 border-b border-border p-[22px]">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-brand-soft text-brand">
          <Icon name="domain" size={22} />
        </span>
        <div>
          <h1 className="text-[20px] font-extrabold text-navy">{v.title}</h1>
          <p className="mt-1 text-[13.5px] text-muted">{v.subtitle}</p>
        </div>
      </div>

      {status === "rejected" && (
        <div className="mx-[22px] mt-[18px] flex items-center gap-2 rounded-[10px] border border-danger/30 bg-danger-soft px-3.5 py-3 text-[13px] font-semibold text-danger">
          <Icon name="error_outline" size={18} /> {v.rejectedBody}
        </div>
      )}

      {/* Field order mirrors the mobile app's verification form exactly. */}
      <div className="flex flex-col gap-[14px] p-[22px]">
        <div>
          <label className={labelCls}>{v.authorityRole}</label>
          <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
            {(["owner", "manager", "employee"] as Role[]).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={`px-4 py-2 text-[13px] font-bold ${role === r ? "bg-navy text-white" : "bg-surface text-muted"}`}
              >
                {r === "owner" ? v.roleOwner : r === "manager" ? v.roleManager : v.roleEmployee}
              </button>
            ))}
          </div>
        </div>

        {/* National ID + legal company name — mirrors the app's "National ID + Company Name" card. */}
        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
          <div>
            <label className={labelCls}>{v.nationalId} <span className="text-[11px] font-medium text-muted">— {locale === "ar" ? "اختياري" : "optional"}</span></label>
            <input className={inputCls} value={nationalId} onChange={(e) => setNationalId(e.target.value)} maxLength={20} dir="ltr" />
          </div>
          <div>
            <label className={labelCls}>{v.companyLegalName} <span className="text-danger">*</span></label>
            <input className={inputCls} value={companyLegalName} onChange={(e) => setCompanyLegalName(e.target.value)} maxLength={200} placeholder={v.companyLegalNameHint} />
            {fe.companyLegalName && <p className="mt-1 text-[12px] text-danger">{fe.companyLegalName}</p>}
          </div>
        </div>

        {/* Company logo (optional) — shown at the top of the bid form suppliers see.
            Hidden behind LOGO_UPLOAD_ENABLED until apps/backend supports companyLogoKey. */}
        {LOGO_UPLOAD_ENABLED && (
        <div>
          <label className={labelCls}>{L("Company logo", "شعار الشركة")} <span className="text-[11px] font-medium text-muted">— {L("optional", "اختياري")}</span></label>
          <div className="flex items-center gap-3 rounded-[10px] border border-border bg-surface px-[14px] py-3">
            <span className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-[10px] border border-border bg-surface2">
              {logoBusy ? <Icon name="hourglass_empty" size={20} className="text-muted" />
                /* eslint-disable-next-line @next/next/no-img-element */
                : logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" />
                : <Icon name="image" size={20} className="text-muted" />}
            </span>
            <span className="flex-1 text-[12px] text-muted">{L("Appears on the bid form your invited suppliers see.", "يظهر في نموذج العرض الذي يراه المؤجّرون المدعوّون.")}</span>
            <label className="flex-none cursor-pointer rounded-lg border border-brand bg-surface px-3 py-1.5 text-[12.5px] font-bold text-brand">
              {logoBusy ? v.uploading : companyLogoKey || logoPreview ? L("Change", "تغيير") : L("Upload", "رفع")}
              <input type="file" accept="image/*" className="hidden" disabled={logoBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickLogo(f); }} />
            </label>
            {(companyLogoKey || logoPreview) && !logoBusy && <button type="button" onClick={() => { setCompanyLogoKey(null); setLogoPreview(null); }} className="flex-none rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-bold text-danger">{L("Remove", "إزالة")}</button>}
          </div>
        </div>
        )}

        {/* Company documents — CR, VAT, National Address are required (AC-09/10). */}
        <div className="mt-1 border-t border-border pt-[14px] text-[11px] font-bold uppercase tracking-wide text-muted">
          {v.docsTitle}
        </div>

        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
          <div>
            <DocUpload label={v.crDoc} required docKey={crDocKey} onKey={setCrDocKey} onError={setErr} />
            {fe.cr && <p className="mt-1 text-[12px] text-danger">{fe.cr}</p>}
          </div>
          <div>
            <DocUpload label={v.vatDoc} required docKey={vatDocKey} onKey={setVatDocKey} onError={setErr} />
            {fe.vat && <p className="mt-1 text-[12px] text-danger">{fe.vat}</p>}
          </div>
        </div>
        <div>
          <DocUpload label={v.nationalAddressDoc} required docKey={nationalAddressDocKey} onKey={setNationalAddressDocKey} onError={setErr} />
          {fe.nationalAddress && <p className="mt-1 text-[12px] text-danger">{fe.nationalAddress}</p>}
        </div>

        {/* Additional documents — all optional (AC-15). */}
        <div className="mt-1 border-t border-border pt-[14px] text-[11px] font-bold uppercase tracking-wide text-muted">
          {v.moreDocsTitle}
        </div>

        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
          <DocUpload label={v.localContentDoc} docKey={localContentDocKey} onKey={setLocalContentDocKey} onError={setErr} />
          <DocUpload label={v.sasoDoc} docKey={sasoHeavyEquipDocKey} onKey={setSasoHeavyEquipDocKey} onError={setErr} />
        </div>

        <div>
          <label className={labelCls}>{v.otherDoc}</label>
          {otherDocKeys.map((_, i) => (
            <p key={i} className="mb-1 inline-flex items-center gap-1 text-[12px] text-ok">
              <Icon name="check_circle" size={14} /> {v.uploaded} {i + 1}
            </p>
          ))}
          <DocUpload
            key={otherDocKeys.length}
            label={v.otherDoc}
            docKey={null}
            onKey={(k) => k && setOtherDocKeys((prev) => [...prev, k])}
            onError={setErr}
          />
        </div>

        {/* Company details — city + location (AC-15). */}
        <div className="mt-1 border-t border-border pt-[14px] text-[11px] font-bold uppercase tracking-wide text-muted">
          {v.detailsTitle}
        </div>

        <div>
          <label className={labelCls}>{v.companyCity}</label>
          <select className={inputCls} value={companyCity} onChange={(e) => setCompanyCity(e.target.value)}>
            <option value="">{v.cityPlaceholder}</option>
            {VERIFY_CITIES.map((c) => (
              <option key={c.value} value={c.value}>
                {locale === "ar" ? c.ar : c.en}
              </option>
            ))}
          </select>
        </div>

        {showLoc || loc ? (
          <div>
            <label className={labelCls}>{v.companyLocation}</label>
            <MapPicker
              value={loc}
              onChange={(lat, lng, address) => {
                setLoc({ lat, lng });
                if (address && !companyAddress.trim()) setCompanyAddress(address);
              }}
              height="200px"
            />
          </div>
        ) : (
          <button type="button" onClick={() => setShowLoc(true)} className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-border bg-surface2 px-[14px] py-3 text-[13px] font-bold text-navy-mid hover:border-brand">
            <Icon name="add_location_alt" size={18} className="text-brand" />
            {v.companyLocation}
            <span className="ms-auto text-[11px] font-medium text-muted">{locale === "ar" ? "اختياري" : "optional"}</span>
          </button>
        )}

        {err && <p className="text-[13px] font-semibold text-danger">{err}</p>}
      </div>

      <div className="border-t border-border p-[22px]">
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-[7px] rounded-[10px] border border-brand bg-brand px-[24px] py-[13px] text-[14.5px] font-bold text-brand-fg transition hover:brightness-[1.04] disabled:opacity-50"
        >
          {!busy && <Icon name="check" size={18} />}
          {busy ? v.submitting : status === "rejected" ? v.resubmit : v.submit}
        </button>
      </div>
    </form>
  );
}

function StatePanel({ icon, tone, title, body }: { icon: string; tone: "ok" | "info"; title: string; body: string }) {
  return (
    <div className="p-[40px] text-center">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${tone === "ok" ? "bg-ok-soft text-ok" : "bg-info-soft text-info"}`}>
        <Icon name={icon} size={28} />
      </span>
      <h1 className="mt-4 text-[20px] font-extrabold text-navy">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] text-muted">{body}</p>
    </div>
  );
}
