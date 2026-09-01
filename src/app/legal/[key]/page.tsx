"use client";

import { use, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/ui";
import { Section } from "@/components/PageSection";
import { SkeletonText } from "@/components/Skeleton";
import { btn } from "@/lib/ds";
import { useLocale, useT } from "@/lib/i18n";
import type { LegalContent } from "@/app/api/app-content/[key]/route";

/**
 * `/legal/privacy-policy` and `/legal/terms-of-use` — the app's own two documents, on the web.
 *
 * ~~`moedatech.net/privacy` and `/terms`.~~ Both 404 (owner, 2026-08-30), and they were never right:
 * the app does not send anyone to the marketing site for these. It routes to a `LegalContentPage`
 * fed by `GET /app/content/{key}`, so the text is a row the product serves and the two clients read
 * one copy of it. This is that page, on this side.
 *
 * The document is TEXT, not markup: the backend stores plain text with paragraph breaks, so it is
 * rendered with `whitespace-pre-wrap` rather than parsed. Nothing here interprets it — a legal
 * document that a renderer reshaped would be a different document from the one the app shows, and
 * `dangerouslySetInnerHTML` over content the client did not write is worse than plain.
 */
export default function LegalPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);

  const [doc, setDoc] = useState<LegalContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    fetch(`/api/app-content/${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: LegalContent) => live && setDoc(d))
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [key, reload]);

  /* The title comes from the DOCUMENT, in the reader's script, and falls back to the app's own label
     for the route while it loads — a blank masthead reads as a page that failed. */
  const fallbackTitle = key === "terms-of-use" ? t.profile.terms : t.profile.privacy;
  const title = doc ? (ar ? doc.titleAr || doc.title : doc.title || doc.titleAr) : fallbackTitle;
  const body = doc ? (ar ? doc.contentAr || doc.content : doc.content || doc.contentAr) : "";

  return (
    <AppShell title={title}>
      <div className="w-full pb-10" dir={ar ? "rtl" : "ltr"}>
        <Section title={title} hint={doc ? `${L("Version", "الإصدار")} ${doc.version}` : undefined}>
          <div className="p-5">
            {/* A document's worth of lines, in three paragraphs — the shape of the thing arriving. */}
            {loading && (
              <div className="flex flex-col gap-6">
                <SkeletonText lines={4} />
                <SkeletonText lines={5} />
                <SkeletonText lines={3} />
              </div>
            )}

            {failed && !loading && (
              <div className="py-10 text-center">
                <p className="text-body font-semibold text-navy">
                  {L("This document could not be loaded.", "تعذّر تحميل هذه الوثيقة.")}
                </p>
                {/* Never an empty page presented as the terms: the failure says so, and offers the
                    one thing that can fix it. */}
                <button onClick={() => setReload((n) => n + 1)} className={btn("primary", "md", { className: "mt-4 transition" })}>
                  <Icon name="refresh" size={16} /> {L("Try again", "أعد المحاولة")}
                </button>
              </div>
            )}

            {!loading && !failed && (
              <article className="whitespace-pre-wrap text-body leading-[1.9] text-navy">{body}</article>
            )}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
