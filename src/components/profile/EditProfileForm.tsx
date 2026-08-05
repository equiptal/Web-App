"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useT, useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { updateProfile } from "@/lib/api/profile-client";
import type { RenterProfile } from "@/lib/contract/onboarding";

interface Opt {
  value: string;
  label: string;
}

function toOpt(raw: unknown, ar: boolean): Opt | null {
  if (typeof raw === "string") return { value: raw, label: raw };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const value = String(o.name ?? o.nameEn ?? o.value ?? o.id ?? "");
    const label = String((ar ? o.nameAr : o.name) ?? o.name ?? o.nameEn ?? value);
    return value ? { value, label } : null;
  }
  return null;
}

const FALLBACK_CITIES: Opt[] = [
  "Riyadh", "Jeddah", "Makkah", "Madinah", "Dammam", "Khobar", "Dhahran", "Jubail",
  "Taif", "Tabuk", "Abha", "Hail", "Buraidah", "Yanbu", "Najran", "Khamis Mushait",
].map((c) => ({ value: c, label: c }));
const FALLBACK_JOBS: Opt[] = [
  "Company Owner", "Project Manager", "Procurement", "Site Engineer", "Operations", "Logistics", "Foreman", "Other",
].map((j) => ({ value: j, label: j }));

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const WA_RE = /^(\+?966|0)?5\d{8}$/;

/**
 * Edit-profile form (app parity: profile_form_page.dart) — mirrors the create form's fields but PUTs
 * `/api/me/profile` (updateProfileSchema). City + job-title are master-data dropdowns; phone is not
 * edited here (that's the change-phone flow). On success it lifts the refreshed profile to the parent.
 */
export function EditProfileForm({
  profile,
  onSaved,
  onCancel,
  currentLogoUrl,
}: {
  profile: RenterProfile;
  onSaved: (next: RenterProfile) => void;
  onCancel: () => void;
  /**
   * Presigned URL of the logo already on file, shown as the initial preview.
   * Comes from `/api/verification` (`companyLogoUrl`) via ProfileView — the logo
   * bucket is not public, so it cannot be derived from a key client-side.
   */
  currentLogoUrl?: string | null;
}) {
  const t = useT();
  const p = t.profile;
  const { locale } = useLocale();
  const ar = locale === "ar";

  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? "");
  const [companyName, setCompanyName] = useState(profile.companyName ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp ?? "");
  const [cities, setCities] = useState<Opt[]>(FALLBACK_CITIES);
  const [jobs, setJobs] = useState<Opt[]>(FALLBACK_JOBS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});

  // Company logo. `companyLogoKey` is only set once the user actually touches the
  // logo: a new S3 key, or "" to clear. It stays undefined otherwise so an
  // ordinary profile edit never disturbs the saved logo.
  //
  // This is the surface that makes the logo recoverable. Verification freezes the
  // company block once approved, but the logo is branding rather than evidence,
  // so `PUT /profile/me` accepts it at any status with no re-review.
  const [companyLogoKey, setCompanyLogoKey] = useState<string | undefined>(undefined);
  const [logoPreview, setLogoPreview] = useState<string | null>(currentLogoUrl ?? null);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    const load = async (path: string, set: (o: Opt[]) => void) => {
      try {
        const r = await fetch(path);
        if (!r.ok) return;
        const raw: unknown = await r.json();
        const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const arr = Array.isArray(raw) ? raw : ((Object.values(obj).find((v) => Array.isArray(v)) as unknown[]) ?? []);
        const opts = arr.map((x) => toOpt(x, ar)).filter((x): x is Opt => !!x);
        if (opts.length) set(opts);
      } catch {
        /* keep fallback */
      }
    };
    void load("/api/master-data/cities", setCities);
    void load("/api/master-data/job-titles", setJobs);
  }, [ar]);

  // Ensure the current stored value is always selectable even if it's not in the fetched list.
  const withCurrent = (opts: Opt[], v: string) =>
    v && !opts.some((o) => o.value === v) ? [{ value: v, label: v }, ...opts] : opts;

  /**
   * Downscales the picked image to 220px on its longest side, re-encodes as PNG,
   * and uploads it through the same presigned doc flow the verification form uses
   * (`/api/profile/doc-upload-url` → PUT). Holds the returned KEY; the save then
   * sends `companyLogoKey`.
   *
   * Uploading on pick — rather than on submit — keeps the save path synchronous
   * and matches VerificationFlow.
   */
  const onPickLogo = (file: File) => {
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 220;
        let { width, height } = image;
        if (width >= height && width > max) {
          height = Math.round((height * max) / width);
          width = max;
        } else if (height > width && height > max) {
          width = Math.round((width * max) / height);
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, width, height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setLogoBusy(true);
          try {
            const r = await fetch("/api/profile/doc-upload-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: "company-logo.png", contentType: "image/png" }),
            });
            if (!r.ok) throw new Error("upload-url");
            const { url, key } = (await r.json()) as { url: string; key: string };
            const put = await fetch(url, {
              method: "PUT",
              body: blob,
              headers: { "Content-Type": "image/png" },
            });
            if (!put.ok) throw new Error("put");
            setCompanyLogoKey(key);
            setLogoPreview(canvas.toDataURL("image/png"));
          } catch {
            setErr(p.companyLogoError);
          } finally {
            setLogoBusy(false);
          }
        }, "image/png");
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next_fe: Record<string, string> = {};
    if (firstName.trim().length < 2 || firstName.trim().length > 30) next_fe.firstName = t.onboarding.errors.firstName;
    if (lastName.trim().length < 2 || lastName.trim().length > 50) next_fe.lastName = t.onboarding.errors.lastName;
    if (!city.trim()) next_fe.city = t.onboarding.errors.city;
    if (!jobTitle.trim()) next_fe.jobTitle = t.onboarding.errors.jobTitle;
    if (email.trim() && !EMAIL_RE.test(email.trim())) next_fe.email = t.onboarding.errors.email;
    if (whatsapp.trim() && !WA_RE.test(whatsapp.replace(/\s/g, ""))) next_fe.whatsapp = t.onboarding.errors.whatsapp;
    if (Object.keys(next_fe).length) {
      setFe(next_fe);
      return;
    }
    setFe({});
    setErr(null);
    setBusy(true);
    const r = await updateProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      city: city.trim(),
      jobTitle: jobTitle.trim(),
      email: email.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      companyName: companyName.trim() || undefined,
      // Undefined unless the logo was touched — see the state declaration.
      companyLogoKey,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.code === "offline" ? p.offline : ar && r.messageAr ? r.messageAr : p.saveError);
      return;
    }
    onSaved({
      ...profile,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      city: city.trim(),
      jobTitle: jobTitle.trim(),
      email: email.trim() || null,
      whatsapp: whatsapp.trim() || null,
      companyName: companyName.trim() || null,
    });
  };

  const inputCls =
    "h-[46px] w-full rounded-[10px] border border-border bg-surface px-[14px] text-[14px] text-navy outline-0 focus:border-brand focus:shadow-[0_0_0_3px_rgba(247,144,9,.12)]";
  const labelCls = "mb-[6px] block text-[12.5px] font-bold text-navy-mid";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[14px]">
      <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
        <div>
          <label className={labelCls}>{p.firstName}</label>
          <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={30} />
          {fe.firstName && <p className="mt-1 text-[12px] text-danger">{fe.firstName}</p>}
        </div>
        <div>
          <label className={labelCls}>{p.lastName}</label>
          <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={50} />
          {fe.lastName && <p className="mt-1 text-[12px] text-danger">{fe.lastName}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
        <div>
          <label className={labelCls}>{p.city}</label>
          <select className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">{p.selectCity}</option>
            {withCurrent(cities, city).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          {fe.city && <p className="mt-1 text-[12px] text-danger">{fe.city}</p>}
        </div>
        <div>
          <label className={labelCls}>{p.jobTitle}</label>
          <select className={inputCls} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}>
            <option value="">{p.selectJobTitle}</option>
            {withCurrent(jobs, jobTitle).map((j) => (
              <option key={j.value} value={j.value}>{j.label}</option>
            ))}
          </select>
          {fe.jobTitle && <p className="mt-1 text-[12px] text-danger">{fe.jobTitle}</p>}
        </div>
      </div>

      <div>
        <label className={labelCls}>
          {p.companyName} <span className="text-[11px] font-medium text-muted">— {p.optional}</span>
        </label>
        <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={200} placeholder={p.companyNamePlaceholder} />
      </div>

      {/* Company logo. Editable at any verification status — it is branding, not
          evidence — so this is where a renter who verified without one adds it. */}
      <div>
        <label className={labelCls}>
          {p.companyLogo} <span className="text-[11px] font-medium text-muted">— {p.optional}</span>
        </label>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-surface px-[14px] py-3">
          <span className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-[10px] border border-border bg-surface2">
            {logoBusy ? (
              <Icon name="hourglass_empty" size={20} className="text-muted" />
            ) : logoPreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoPreview} alt="" className="h-full w-full object-contain" />
            ) : (
              <Icon name="image" size={20} className="text-muted" />
            )}
          </span>
          <span className="flex-1 text-[12px] text-muted">{p.companyLogoNote}</span>
          <label className="flex-none cursor-pointer rounded-lg border border-brand bg-surface px-3 py-1.5 text-[12.5px] font-bold text-brand">
            {logoBusy ? p.saving : logoPreview ? p.companyLogoChange : p.companyLogoUpload}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={logoBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickLogo(f);
              }}
            />
          </label>
          {logoPreview && !logoBusy && (
            <button
              type="button"
              /* "" (not undefined) — the backend treats an empty string as
                 "clear it" and an omitted field as "leave unchanged". */
              onClick={() => {
                setCompanyLogoKey("");
                setLogoPreview(null);
              }}
              className="flex-none rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-bold text-danger"
            >
              {p.companyLogoRemove}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
        <div>
          <label className={labelCls}>
            {p.email} <span className="text-[11px] font-medium text-muted">— {p.optional}</span>
          </label>
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
          {fe.email && <p className="mt-1 text-[12px] text-danger">{fe.email}</p>}
        </div>
        <div>
          <label className={labelCls}>
            {p.whatsapp} <span className="text-[11px] font-medium text-muted">— {p.optional}</span>
          </label>
          <input className={inputCls} inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+9665XXXXXXXX" dir="ltr" />
          {fe.whatsapp && <p className="mt-1 text-[12px] text-danger">{fe.whatsapp}</p>}
        </div>
      </div>

      {err && <p className="text-[13px] font-semibold text-danger">{err}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 flex-1 rounded-[10px] border border-border bg-surface text-[13.5px] font-bold text-navy-mid hover:bg-surface2"
        >
          {p.cancel}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-brand text-[13.5px] font-bold text-brand-fg transition hover:brightness-[1.04] disabled:opacity-50"
        >
          {!busy && <Icon name="save" size={16} />}
          {busy ? p.saving : p.save}
        </button>
      </div>
    </form>
  );
}
