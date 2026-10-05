"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { CloseIcon } from "@/components/HeaderIcons";
import { btn } from "@/lib/ds";
import { useT } from "@/lib/i18n";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/config/store-links";
import {
  handoffSurface,
  readQrDismissed,
  rememberQrDismissed,
  storeUrlFor,
  type HandoffSurface,
} from "@/lib/app-handoff";

/**
 * The app handoff on `/create` for a renter who pressed «Request now» on a supplier's public store
 * (Supplier OS `docs/request-now-tickets-web.md`, design «Order Blocker Flow»): popup 1a on a
 * desktop, screen 1b inside an in-app browser, banner 1c on any other phone. Which one is
 * `handoffSurface`'s decision; this file only draws it. The form behind is never touched, so closing
 * any of them leaves the request as it was.
 *
 * ⚠️ The design draws a spinner beside «Continue on web» and on 1b. Neither is drawn here: nothing
 * on this page is loading or redirecting, and a spinner that never finishes reads as a stuck page.
 */
export function AppHandoff() {
  const params = useSearchParams();
  const src = params.get("src");
  const appLink = params.get("appLink");
  const storeId = params.get("storeId");
  const supplierName = params.get("supplierName");

  /* Decided after mount: the pointer, the user agent and sessionStorage do not exist on the server,
     and guessing there would flash the wrong surface on hydration. */
  const [surface, setSurface] = useState<HandoffSurface>(null);
  const [coarse, setCoarse] = useState(false);
  const [ua, setUa] = useState("");
  useEffect(() => {
    const isCoarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    setCoarse(isCoarse);
    setUa(navigator.userAgent);
    setSurface(
      handoffSurface({ src, appLink, coarse: isCoarse, userAgent: navigator.userAgent, qrDismissed: readQrDismissed(appLink) }),
    );
  }, [src, appLink]);

  const store = useStoreFace(surface === "qr" || surface === "inApp" ? storeId : null);
  const name = store.name ?? supplierName;

  if (surface === "qr" && appLink) {
    return (
      <QrPopup
        appLink={appLink}
        storeName={name}
        logoUrl={store.logoUrl}
        onContinue={() => {
          rememberQrDismissed(appLink);
          setSurface(null);
        }}
      />
    );
  }
  if (surface === "inApp" && appLink) {
    return <InAppScreen appLink={appLink} storeName={name} logoUrl={store.logoUrl} onContinue={() => setSurface("banner")} />;
  }
  if (surface === "banner") {
    return <AppBanner storeUrl={storeUrlFor(ua, coarse)} onClose={() => setSurface(null)} />;
  }
  return null;
}

/**
 * The store's name and logo, for the QR centre and the store line (open decision 2, owner
 * 2026-10-05: the logo, else the name's initial, as frame 1a draws it). Read from the same
 * `/api/stores/:id` the share panel uses. A failed read leaves both null, and the surfaces fall back
 * to `supplierName` from the URL and an initial.
 */
function useStoreFace(storeId: string | null): { name: string | null; logoUrl: string | null } {
  const [face, setFace] = useState<{ name: string | null; logoUrl: string | null }>({ name: null, logoUrl: null });
  useEffect(() => {
    if (!storeId) return;
    let live = true;
    fetch(`/api/stores/${encodeURIComponent(storeId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { name?: string; logoUrl?: string | null } | null) => {
        if (live && d) setFace({ name: d.name?.trim() || null, logoUrl: d.logoUrl ?? null });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [storeId]);
  return face;
}

const initialOf = (name: string | null) => name?.trim().charAt(0).toUpperCase() ?? "";

/**
 * «متجر fadwa ali» with the store's mark in a small tile, above the title on 1a and 1b: the logo
 * when the store has one (owner, 2026-10-05), the name's initial otherwise.
 */
function StoreLine({ name, logoUrl, onDark = false }: { name: string | null; logoUrl: string | null; onDark?: boolean }) {
  const t = useT();
  const [logoFailed, setLogoFailed] = useState(false);
  if (!name) return null;
  const showLogo = !!logoUrl && !logoFailed;
  return (
    <div className={`flex items-center gap-2 text-meta ${onDark ? "justify-center text-white/70" : "text-muted"}`}>
      <span className="grid h-7 w-7 flex-none place-items-center overflow-hidden rounded-sm bg-brand-soft text-meta font-extrabold text-brand-deep">
        {showLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-full w-full bg-white object-contain" onError={() => setLogoFailed(true)} />
        ) : (
          initialOf(name)
        )}
      </span>
      {t.appHandoff.storeLabel.replace("{name}", name)}
    </div>
  );
}

/**
 * Frame 1a, drawn as the prototype draws it (owner, 2026-10-05: *"i want continue on web not x,
 * follow the prototype exactly in ui"*): the copy on the surface side, the QR on a navy side, over
 * the dimmed and blurred form.
 *
 * ⚠️ **«Continue on web» is the ONLY way out**: no corner close, no backdrop click, no Escape. That is
 * why this is its own overlay and not the house `Dialog`, whose three exits are the point of it, and
 * whose five widths do not include the prototype's 720.
 *
 * ⚠️ The small spinner beside the button is the prototype's. Nothing is loading behind it.
 */
function QrPopup({
  appLink,
  storeName,
  logoUrl,
  onContinue,
}: {
  appLink: string;
  storeName: string | null;
  logoUrl: string | null;
  onContinue: () => void;
}) {
  const t = useT();
  const c = t.appHandoff;
  const button = useRef<HTMLButtonElement>(null);
  // Focus lands on the one control a keyboard can use to leave.
  useEffect(() => button.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-deep/55 p-4 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        className="grid w-[720px] max-w-full overflow-hidden rounded-lg bg-surface sm:grid-cols-[minmax(0,1fr)_280px]"
      >
        <div className="flex flex-col gap-4 px-9 pb-[30px] pt-9 text-navy">
          <StoreLine name={storeName} logoUrl={logoUrl} />
          <h2 className="text-hero font-extrabold leading-tight">{c.title}</h2>
          <p className="text-subhead leading-relaxed text-muted">{c.body}</p>
          <div className="mt-auto flex items-center gap-3 pt-3">
            <button
              ref={button}
              type="button"
              onClick={onContinue}
              className="h-[46px] rounded-md border border-border-strong bg-surface px-[22px] text-subhead font-extrabold text-navy transition hover:bg-surface2"
            >
              {c.continueWeb}
            </button>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-brand" aria-hidden="true" />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 bg-navy px-5 py-[30px]">
          <QrCode value={appLink} label={storeName} logoUrl={logoUrl} />
          <p className="text-center text-subhead font-extrabold text-white">{c.scanHint}</p>
          <StoreBadges />
        </div>
      </div>
    </div>
  );
}

/**
 * The QR, drawn from `appLink` EXACTLY as given (the ticket: never change or rebuild it).
 *
 * Error correction `H` restores up to 30% of the code, which is what lets the centre carry the
 * store's logo or initial over about a fifth of its width and still scan.
 */
function QrCode({ value, label, logoUrl }: { value: string; label: string | null; logoUrl: string | null }) {
  const path = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "H" });
    let d = "";
    for (let r = 0; r < modules.size; r++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(r, col)) d += `M${col} ${r}h1v1h-1z`;
      }
    }
    return { d, size: modules.size };
  }, [value]);
  const initial = initialOf(label);
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !!logoUrl && !logoFailed;

  return (
    <div className="relative grid h-[203px] w-[203px] place-items-center rounded-md bg-white p-3.5" data-testid="handoff-qr">
      <svg viewBox={`0 0 ${path.size} ${path.size}`} className="h-full w-full" shapeRendering="crispEdges" role="img" aria-label={value}>
        <path d={path.d} fill="#000" />
      </svg>
      {(showLogo || initial) && (
        <span className="absolute grid place-items-center rounded-md bg-white p-[5px]">
          <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-sm bg-brand text-subhead font-extrabold text-white">
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full bg-white object-contain" onError={() => setLogoFailed(true)} />
            ) : (
              initial
            )}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * The two store badges on 1a: black, white glyph, the stores' own English words in both languages
 * (as the design draws them, and as the stores print them). Each opens in a new tab (UAT-05).
 */
function StoreBadges() {
  const badge =
    "flex flex-none items-center gap-[7px] rounded-md border border-white/25 bg-black px-2 py-1.5 text-white transition hover:border-white/50";
  return (
    <div className="flex gap-1.5" dir="ltr">
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className={badge} aria-label="Download on the App Store">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
        <span className="flex flex-col whitespace-nowrap text-start leading-none">
          <span className="text-label font-normal">Download on the</span>
          <span className="text-meta font-extrabold">App Store</span>
        </span>
      </a>
      <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className={badge} aria-label="Get it on Google Play">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
          <path d="M4 2.4v19.2l15-9.6z" />
        </svg>
        <span className="flex flex-col whitespace-nowrap text-start leading-none">
          <span className="text-label font-normal">GET IT ON</span>
          <span className="text-meta font-extrabold">Google Play</span>
        </span>
      </a>
    </div>
  );
}

/**
 * Frame 1b, for an in-app browser that may block the app: a whole navy screen over the page.
 *
 * «Open in app» is a plain anchor the renter taps (WEB-3). The design has no such button because it
 * pictures an automatic redirect, but a script that sends the page there by itself does not open the
 * app on iPhone: iOS only hands a universal link to the app on a user's tap.
 */
function InAppScreen({
  appLink,
  storeName,
  logoUrl,
  onContinue,
}: {
  appLink: string;
  storeName: string | null;
  logoUrl: string | null;
  onContinue: () => void;
}) {
  const t = useT();
  const c = t.appHandoff;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={c.title}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 overflow-y-auto bg-navy px-8 py-10 text-center"
    >
      <div className="text-display font-extrabold text-white">{c.brand}</div>
      <StoreLine name={storeName} logoUrl={logoUrl} onDark />
      <h2 className="text-title font-extrabold text-white">{c.title}</h2>
      <p className="max-w-[320px] text-body leading-relaxed text-white/70">{c.body}</p>
      <a href={appLink} className={btn("primary", "lg", { full: true, className: "mt-4 max-w-[320px]" })}>
        {c.openInApp}
      </a>
      <button type="button" onClick={onContinue} className="text-body font-extrabold text-brand-light underline underline-offset-2">
        {c.continueBrowser}
      </button>
    </div>
  );
}

/**
 * Frame 1c. In the page's flow, not floating, so closing it moves the form up without a gap
 * (UAT-11). The × is 44px, the touch minimum, as the design draws it.
 */
function AppBanner({ storeUrl, onClose }: { storeUrl: string; onClose: () => void }) {
  const t = useT();
  const c = t.appHandoff;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-sm border border-brand/35 bg-brand-soft ps-4" data-testid="handoff-banner">
      <p className="min-w-0 flex-1 py-3 text-body leading-normal text-navy">
        {c.bannerText} ·{" "}
        <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="font-extrabold text-brand-deep underline underline-offset-2">
          {c.download}
        </a>
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t.startRequest.close}
        className="grid h-11 w-11 flex-none place-items-center text-muted transition hover:text-navy"
      >
        <CloseIcon size={18} />
      </button>
    </div>
  );
}
