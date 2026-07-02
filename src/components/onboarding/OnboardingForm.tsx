"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";

interface Opt {
  value: string;
  label: string;
}

/** Tolerantly normalise a master-data entry (string or {name,nameAr,id}) to a {value,label}. */
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

// Static fallback lists so city/job-title are ALWAYS dropdowns (like the app), even before the live
// master-data list loads or if it's unavailable. Live `/master-data/*` overrides these when fetched.
const FALLBACK_CITIES: Opt[] = [
  "Riyadh", "Jeddah", "Makkah", "Madinah", "Dammam", "Khobar", "Dhahran", "Jubail",
  "Taif", "Tabuk", "Abha", "Hail", "Buraidah", "Yanbu", "Najran", "Khamis Mushait",
].map((c) => ({ value: c, label: c }));
const FALLBACK_JOBS: Opt[] = [
  "Company Owner", "Project Manager", "Procurement", "Site Engineer", "Operations", "Logistics", "Foreman", "Other",
].map((j) => ({ value: j, label: j }));

/**
 * Account-creation form (web-app/003 Flow 1, AC-01/02/03/04/05/06). Prototype design, app/AC fields:
 * first/last name, city + job-title selectors (master-data), optional email + WhatsApp; phone read-only.
 * Submit → `/api/profile/complete` → guest becomes basic → refresh session → return to `next` or home.
 */
export function OnboardingForm({
  next,
  onDone,
  headline,
  subhead,
  requireEmail = false,
}: {
  next: string;
  /** When provided, called after the account is created instead of navigating (e.g. modal flow). */
  onDone?: () => void;
  /** Optional header overrides (e.g. "Create your account to post your request"). */
  headline?: string;
  subhead?: string;
  /** When true, email is a required field (combined create gate). Default false keeps the standalone
   *  onboarding route's email optional. */
  requireEmail?: boolean;
}) {
  const t = useT();
  const o = t.onboarding;
  const { locale } = useLocale();
  const router = useRouter();
  const { user, refresh } = useSession();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cities, setCities] = useState<Opt[]>(FALLBACK_CITIES);
  const [jobs, setJobs] = useState<Opt[]>(FALLBACK_JOBS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});

  useEffect(() => {
    const ar = locale === "ar";
    const load = async (path: string, set: (o: Opt[]) => void) => {
      try {
        const r = await fetch(path);
        if (!r.ok) return;
        const raw: unknown = await r.json();
        // Backend wraps the list under a key (`{ cities: [...] }` / `{ jobTitles: [...] }`),
        // and the BFF unwraps the `data` envelope — so take the first array-valued property.
        const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const arr = Array.isArray(raw) ? raw : ((Object.values(obj).find((v) => Array.isArray(v)) as unknown[]) ?? []);
        const opts = arr.map((x) => toOpt(x, ar)).filter((x): x is Opt => !!x);
        if (opts.length) set(opts);
      } catch {
        /* leave the static fallback list (still a dropdown) */
      }
    };
    void load("/api/master-data/cities", setCities);
    void load("/api/master-data/job-titles", setJobs);
  }, [locale]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const next_fe: Record<string, string> = {};
    if (firstName.trim().length < 2 || firstName.trim().length > 30) next_fe.firstName = o.errors.firstName;
    if (lastName.trim().length < 2 || lastName.trim().length > 50) next_fe.lastName = o.errors.lastName;
    if (!city.trim()) next_fe.city = o.errors.city;
    if (!jobTitle.trim()) next_fe.jobTitle = o.errors.jobTitle;
    // Email is optional by default, but required in the combined create gate. When present (either
    // mode), it must be a valid address.
    const emailVal = email.trim();
    if (requireEmail && !emailVal) next_fe.email = o.errors.emailRequired;
    else if (emailVal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)) next_fe.email = o.errors.email;
    if (whatsapp.trim() && !/^(\+?966|0)?5\d{8}$/.test(whatsapp.replace(/\s/g, ""))) next_fe.whatsapp = o.errors.whatsapp;
    if (Object.keys(next_fe).length) {
      setFe(next_fe);
      return;
    }
    setFe({});
    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          city: city.trim(),
          jobTitle: jobTitle.trim(),
          companyName: companyName.trim() || undefined,
          email: email.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
        }),
      });
    } catch {
      setBusy(false);
      setErr(o.errors.offline); // AC-23
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { detail?: string };
      setErr(d.detail || o.errors.submit);
      return;
    }
    await refresh(); // AC-05: session tier guest→basic, unblocks canCreate
    if (onDone) {
      onDone(); // modal flow: caller closes + continues (e.g. auto-submit the RFQ)
      return;
    }
    const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/"; // AC-06
    router.replace(dest);
  };

  const inputCls =
    "h-[46px] w-full rounded-[10px] border border-border bg-surface px-[14px] text-[14px] outline-0 focus:border-brand focus:shadow-[0_0_0_3px_rgba(247,144,9,.12)]";
  const labelCls = "mb-[6px] block text-[12.5px] font-bold text-navy-mid";

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-start gap-3 border-b border-border p-[22px]">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-brand-soft text-brand">
          <Icon name="person_add" size={22} />
        </span>
        <div>
          <h1 className="text-[20px] font-extrabold text-navy">{headline ?? o.title}</h1>
          <p className="mt-1 text-[13.5px] text-muted">{subhead ?? o.subtitle}</p>
        </div>
      </div>

      <div className="flex flex-col gap-[14px] p-[22px]">
        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
          <div>
            <label className={labelCls}>{o.firstName}</label>
            <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={30} />
            {fe.firstName && <p className="mt-1 text-[12px] text-danger">{fe.firstName}</p>}
          </div>
          <div>
            <label className={labelCls}>{o.lastName}</label>
            <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={50} />
            {fe.lastName && <p className="mt-1 text-[12px] text-danger">{fe.lastName}</p>}
          </div>
        </div>

        <div>
          <label className={labelCls}>
            {o.phone} <span className="ms-1 text-[11px] font-bold text-ok">✓ {o.verified}</span>
          </label>
          <input className={`${inputCls} bg-surface2 text-muted`} value={user?.phone ?? ""} readOnly dir="ltr" />
        </div>

        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
          <div>
            <label className={labelCls}>{o.city}</label>
            <select className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">{o.selectCity}</option>
              {cities.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {fe.city && <p className="mt-1 text-[12px] text-danger">{fe.city}</p>}
          </div>
          <div>
            <label className={labelCls}>{o.jobTitle}</label>
            <select className={inputCls} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}>
              <option value="">{o.selectJobTitle}</option>
              {jobs.map((j) => (
                <option key={j.value} value={j.value}>{j.label}</option>
              ))}
            </select>
            {fe.jobTitle && <p className="mt-1 text-[12px] text-danger">{fe.jobTitle}</p>}
          </div>
        </div>

        <div>
          <label className={labelCls}>
            {o.companyName} <span className="text-[11px] font-medium text-muted">— {o.optional}</span>
          </label>
          <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={200} placeholder={o.companyNamePlaceholder} />
        </div>

        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              {o.email}{" "}
              {requireEmail ? (
                <span className="text-danger">*</span>
              ) : (
                <span className="text-[11px] font-medium text-muted">— {o.optional}</span>
              )}
            </label>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
            {fe.email && <p className="mt-1 text-[12px] text-danger">{fe.email}</p>}
          </div>
          <div>
            <label className={labelCls}>
              {o.whatsapp} <span className="text-[11px] font-medium text-muted">— {o.optional}</span>
            </label>
            <input className={inputCls} inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+9665XXXXXXXX" dir="ltr" />
            {fe.whatsapp && <p className="mt-1 text-[12px] text-danger">{fe.whatsapp}</p>}
          </div>
        </div>

        {err && <p className="text-[13px] font-semibold text-danger">{err}</p>}
      </div>

      <div className="border-t border-border p-[22px]">
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-[7px] rounded-[10px] border border-brand bg-brand px-[24px] py-[13px] text-[14.5px] font-bold text-brand-fg transition hover:brightness-[1.04] disabled:opacity-50"
        >
          {busy ? o.submitting : o.submit}
          {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
        </button>
      </div>
    </form>
  );
}
