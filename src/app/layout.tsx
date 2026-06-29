import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans, Tajawal, Nunito } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";

// Nunito is the prototype's brand typeface (weights 400–900) — the default sans for the redesign.
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const tajawal = Tajawal({ variable: "--font-tajawal", subsets: ["arabic"], weight: ["400", "500", "700", "800"] });

const siteUrl = "https://web.moedatech.net";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Moedatech — Equipment RFQs",
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
    title: "Moedatech — Equipment RFQs",
    description:
      "Create an equipment RFQ from a pasted or uploaded document, collect bids, and close the deal — all in one place.",
    url: siteUrl,
    images: [{ url: "/moedatech-app-icon.png", width: 1024, height: 1024, alt: "Moedatech" }],
  },
  twitter: {
    card: "summary",
    title: "Moedatech — Equipment RFQs",
    description: "Create an equipment RFQ, collect bids, and close the deal — all in one place.",
    images: ["/moedatech-app-icon.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1c3550",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,500,0,0" />
      </head>
      <body className={`${nunito.variable} ${inter.variable} ${plex.variable} ${tajawal.variable} antialiased`}>
        <LocaleProvider>
          <SessionProvider>{children}</SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
