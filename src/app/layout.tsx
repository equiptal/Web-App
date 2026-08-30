import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { IntercomWidget } from "@/components/support/IntercomWidget";
import { UiPins } from "@/components/dev/UiPins";

// ── The Latin face is the SYSTEM font now (owner, 2026-08-30) ───────────────────────────────
// ~~Nunito is the prototype's brand typeface, the default sans for the redesign, and Inter is the one
// the prototype screens name.~~ Both are gone: `globals.css` sets Latin to `"Segoe UI", system-ui, …`,
// which is what the supplier-OS prototypes have always used and what the owner asked the whole web to
// match. Nothing reads `--font-nunito` or `--font-inter` any more, so loading them downloaded two
// families to render none of them.
//
// This means the app takes the reader's own system face — Segoe UI on Windows, San Francisco on Apple,
// Roboto on Android. That is the trade the owner chose knowingly: Segoe UI is not licensed as a webfont
// and cannot be served, so matching it exactly everywhere was never on the table.
//
// The two that REMAIN are still real downloads, and each still earns it:
//
// ── The Arabic face is IBM Plex Sans Arabic, not Tajawal (owner, 2026-08-19) ─────────────────────
// The prototype every RTL screen is drawn from sets `font-family:'IBM Plex Sans Arabic'` (`app.css:3`),
// and its geometry — 392px panel, 64px header, one-line pills — is measured in that face. Tajawal runs
// wider at the same sizes, so the bid-map panel truncated the supplier's name, wrapped the shortfall
// sentence onto a second line and crowded the count pills, none of which happens in the prototype at
// the same width. Rendered side by side, swapping only the font fixed all three at once; nothing about
// the layout rules had to change.
//
// It also puts the Arabic and the Latin on ONE superfamily: `--font-plex` was already the numeric face,
// so a figure inside an Arabic run no longer changes typeface mid-line.
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
// 800 is carried because the surface asks for it (titles, chips, pills). Plex Arabic ships no 900; the
// few 900s in the stylesheets fall back to 700 rather than being synthesised, which is the safe
// direction — a faux-bold Arabic is worse than a slightly lighter one.
const plexArabic = IBM_Plex_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], weight: ["400", "500", "600", "700"], preload: false });

const siteUrl = "https://web.moedatech.net";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Moedatech - WebApp معداتك - تطبيق الويب",
    template: "%s — Moedatech",
  },
  description:
    "Create an equipment RFQ from a pasted or uploaded document, collect bids, and close the deal — all in one place.",
  applicationName: "Moedatech",
  keywords: ["Moedatech", "equipment", "RFQ", "rental", "bids", "construction equipment", "معداتك"],
  authors: [{ name: "Moedatech" }],
  creator: "Moedatech",
  publisher: "Moedatech",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Moedatech",
    title: "Moedatech - WebApp معداتك - تطبيق الويب",
    description:
      "Create an equipment RFQ from a pasted or uploaded document, collect bids, and close the deal — all in one place.",
    url: siteUrl,
    images: [{ url: "/moedatech-app-icon.png", width: 1024, height: 1024, alt: "Moedatech" }],
  },
  twitter: {
    card: "summary",
    title: "Moedatech - WebApp معداتك - تطبيق الويب",
    description: "Create an equipment RFQ, collect bids, and close the deal — all in one place.",
    images: ["/moedatech-app-icon.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "var(--navy)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,500,0,0" />
      </head>
      <body className={`${plex.variable} ${plexArabic.variable} antialiased`}>
        <LocaleProvider>
          <SessionProvider>
            {children}
            {/* Inside the providers because it reads the session and the locale, and at the root so the
                launcher is on every page — support is least reachable exactly where it is most needed. */}
            <IntercomWidget />
            {/* STAGING BRANCH ONLY — DO NOT MERGE TO main. A developer toggle that numbers every
                registered surface, so a restyle can be asked for by number ("tighten #26"). This one
                line is the whole mount: delete it and the overlay is gone, whatever else is left in
                the tree. It already renders nothing on the production host (see lib/uiPins.ts), but
                that guard is the belt, not the plan. */}
            <UiPins />
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
