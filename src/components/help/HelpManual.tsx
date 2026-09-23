"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/config/support";
import { pin } from "@/lib/uiPins";

/**
 * ── The manual (owner, 2026-09-06) ───────────────────────────────────────────────────────────────
 * *"A modal that opens on clicking [the «?»]. This modal is our manual, with sections for our main
 * features that might need help… clear, simple, short, straightforward."*
 *
 * **Seven sections, one screen each, in the owner's own order** (2026-09-06) — the order a renter
 * meets them, not the order the app is built in. He arrives to post a machine, so posting is first
 * and awarding is last; a manual organised by our own modules would ask him to know where a thing
 * lives before he could read about it.
 *
 * ~~Nine, with «Browse suppliers» and «Your company and papers».~~ The owner cut both and merged the
 * requests list with the comparison: browsing is how he finds a firm to ADD, which section 4 already
 * covers, and a profile he fills once is not a feature he needs a manual for.
 *
 * **Three lines a section, hard.** A manual nobody finishes is a manual nobody has. Each section
 * says what the feature IS, the one thing that trips people on it, and nothing else. Anything that
 * needs a paragraph is a sign the screen itself needs the sentence, not this book.
 *
 * **A slot for a picture, empty for now.** `image` on a section renders a screenshot above its
 * lines; none is set yet, and the layout is drawn so that adding one later changes no copy.
 *
 * The contact block at the foot is the app's own support card (`support_page.dart`), with the same
 * number, the same WhatsApp line and the same four accounts — one set of contact details across the
 * two products, so a renter who reads one and calls the other reaches the same desk.
 */

/** The app's own support details (`support_page.dart`, `AppConstants.supportWhatsAppNumber`). */
const SUPPORT_PHONE = "0115207105";
const SUPPORT_PHONE_SHOWN = "011 520 7105";
const SOCIALS: { key: string; label: string; url: string; mark: string }[] = [
  { key: "instagram", label: "Instagram", url: "https://instagram.com/moedatech.sa", mark: "photo_camera" },
  { key: "x", label: "X", url: "https://x.com/moedatech", mark: "tag" },
  { key: "tiktok", label: "TikTok", url: "https://tiktok.com/@moedatech.sa", mark: "music_note" },
  { key: "facebook", label: "Facebook", url: "https://www.facebook.com/moedatech.sa", mark: "thumb_up" },
];

type Section = {
  key: string;
  icon: string;
  /** A screenshot for this section. Null until one is cut; the layout already holds the slot. */
  image?: string | null;
};

/** The seven, in the owner's order. Copy lives in the dictionary; this is the spine.
 *  Written out rather than mapped over an icon table: a `const` read by a `const` above it is a
 *  temporal-dead-zone crash at import time, and this file is imported by the shell on every page. */
const SECTIONS: Section[] = [
  { key: "post", icon: "edit", image: "/manual/post.png" },
  { key: "share", icon: "link", image: "/manual/share.png" },
  { key: "bids", icon: "table_chart", image: "/manual/bids.png" },
  { key: "suppliers", icon: "groups", image: "/manual/suppliers.png" },
  { key: "map", icon: "place", image: "/manual/map.png" },
  { key: "counter", icon: "swap_horiz", image: "/manual/counter.png" },
  // «Accept», never «award» (owner, 2026-09-06): a renter accepts a supplier's deal; he is not
  // running a tender and the word does not belong to this product.
  { key: "accept", icon: "check_circle", image: "/manual/accept.png" },
];

/* ⚠️ Every glyph above is one this app ALREADY draws. `Icon` renders the legacy «Material Icons
   Outlined» family (`layout.tsx`), which is frozen: a Material SYMBOLS name — `handshake`,
   `price_change`, `group_add` — is not in it, and an unknown name does not fall back to anything.
   It renders as its own literal text, so the section would read «price_change» in the list. */

export function HelpManual({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  /* One section open at a time. A manual with every section expanded is a wall, and the renter came
     here with ONE question — the list is how he finds which. The first opens by default so the
     modal never renders as a bare list of words. */
  const [openKey, setOpenKey] = useState<string>(SECTIONS[0].key);

  const copy = (key: string, part: "t" | "b") =>
    (t.help.sections as Record<string, { t: string; b: string }>)[key]?.[part] ?? "";

  return (
    <Dialog open={open} onClose={onClose} title={t.help.title} subtitle={t.help.subtitle} size="md">
      <div {...pin("help-manual")} className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {SECTIONS.map((s) => {
            const isOpen = openKey === s.key;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenKey(isOpen ? "" : s.key)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start transition hover:bg-surface2/60"
                >
                  <span className="grid size-7 flex-none place-items-center rounded-full bg-surface2 text-navy-mid">
                    <Icon name={s.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body font-extrabold text-navy">{copy(s.key, "t")}</span>
                  <span aria-hidden="true" className={`flex-none text-meta font-semibold text-muted transition ${isOpen ? "rotate-180" : ""}`}>
                    ⌄
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 ps-[52px]">
                    {/* The picture slot. Nothing is cut yet; a section that gains one draws it here,
                        above its lines, and no copy moves. */}
                    {s.image && (
                      <span className="overflow-hidden rounded-sm border border-border">
                        <Image src={s.image} alt="" width={640} height={360} className="h-auto w-full" />
                      </span>
                    )}
                    <p className="text-meta leading-[1.6] text-muted-dark">{copy(s.key, "b")}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* ── Reaching a person, exactly as the app offers it ────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 rounded-md border border-border p-3.5">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{t.help.contact}</span>

          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-sm px-1 py-1.5 transition hover:bg-surface2/70"
          >
            <span className="grid size-8 flex-none place-items-center rounded-md bg-ok-soft text-ok">
              <Icon name="chat" size={17} />
            </span>
            <span className="text-body font-semibold text-navy">{t.help.whatsapp}</span>
          </a>

          <a href={`tel:${SUPPORT_PHONE}`} className="flex items-center gap-2.5 rounded-sm px-1 py-1.5 transition hover:bg-surface2/70">
            <span className="grid size-8 flex-none place-items-center rounded-md bg-surface2 text-navy-mid">
              <Icon name="call" size={17} />
            </span>
            <span className="flex-1 text-body font-semibold text-navy">{t.help.call}</span>
            {/* The number reads left to right in both locales — it is dialled, not read as prose. */}
            <span dir="ltr" className="keep-mono flex-none text-meta font-semibold text-muted">{SUPPORT_PHONE_SHOWN}</span>
          </a>

          <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="rounded-full bg-surface2 px-2.5 py-1 text-label font-semibold text-navy-mid">{t.help.follow}</span>
            {SOCIALS.map((s) => (
              <a
                key={s.key}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                title={s.label}
                className="grid size-9 place-items-center rounded-md text-navy-mid transition hover:bg-surface2"
              >
                <Icon name={s.mark} size={18} />
              </a>
            ))}
          </div>
        </div>

        {/* The mark at the foot, quiet: the manual is ours, and this is where a reader looks to see
            whose it is. */}
        <div className="flex items-center justify-center gap-2 pb-1 pt-0.5">
          <Image src="/moedatech-logo.svg" alt="Moedatech" width={104} height={20} className="h-5 w-auto opacity-70" />
          <span className="text-label font-semibold text-muted-light">{L("Manual", "الدليل")}</span>
        </div>
      </div>
    </Dialog>
  );
}
