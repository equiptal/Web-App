import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans, Tajawal } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const tajawal = Tajawal({ variable: "--font-tajawal", subsets: ["arabic"], weight: ["400", "500", "700", "800"] });

export const metadata: Metadata = {
  title: "Request equipment — Moedatech",
  description: "Create an equipment RFQ from a pasted or uploaded document.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,500,0,0" />
      </head>
      <body className={`${inter.variable} ${plex.variable} ${tajawal.variable} antialiased`}>
        <LocaleProvider>
          <SessionProvider>{children}</SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
