/**
 * The message a renter sends with his link — his words around our card.
 *
 * ── Two halves, and only one of them is his (owner, 2026-09-02) ─────────────────────────────────
 *
 * *"users can edit the template in terms of the wording of text sections like hello etc not the
 * request card itself this is fixed from us."*
 *
 * So the message is split down the middle:
 *
 *   - **His words** — the greeting, the line that introduces the request, and the sign-off. He
 *     writes them once and every request after that carries them, which is the whole point: a firm
 *     that always opens with the same sentence should not have to type it forty times.
 *   - **Our card** — the reference, the machines, the site, the dates, the terms, the deadline. Not
 *     editable, and it must not be: a supplier prices what the card says. A renter who could edit it
 *     could send a card that disagrees with the request it links to, and the first anyone would know
 *     is a withdrawn bid at the deal room.
 *
 * ── One template, both channels ─────────────────────────────────────────────────────────────────
 *
 * E-mail and WhatsApp send the same words. They are read in different frames — a subject line and a
 * From, or a chat bubble — but a supplier who gets both should not be reading two different requests.
 *
 * ── Where it is kept ────────────────────────────────────────────────────────────────────────────
 *
 * This browser, per language. It is the renter's own phrasing, not an account setting, and it never
 * leaves the machine — there is no backend field for it and asking for one would be asking the
 * backend to store a greeting.
 */

import type { BidCardModel } from "@/lib/bidCardModel";

export interface ShareTemplate {
  /** `Hello,` — opens the message. */
  greeting: string;
  /** The line that introduces the request, above the card. */
  intro: string;
  /** `Thanks,` and whatever follows it. */
  signoff: string;
}

/**
 * The one placeholder, spelled the same in both languages so a renter who switches keeps his wording.
 * Anything else he types is his own text and is sent verbatim.
 */
export const NAME_TOKEN = "{name}";

/**
 * ⚠️ Two forms of the same default, because a sentence is not a slot.
 *
 * "{name} invites you to bid" with the token stripped is " invites you to bid" — not a shorter
 * sentence, a broken one. A renter whose company we do not know is common (the name is read from
 * `/api/me`, and that call can fail), so the untouched default has a form that reads properly
 * without it. His OWN wording is never rewritten: whatever he typed is sent, token removed.
 */
const DEFAULTS = {
  en: {
    greeting: "Hello,",
    intro: `${NAME_TOKEN} invites you to bid on an equipment request.`,
    introNoName: "You are invited to bid on an equipment request.",
    signoff: `Thanks,\n${NAME_TOKEN}`,
    signoffNoName: "Thanks,",
  },
  ar: {
    greeting: "مرحباً،",
    intro: `يدعوك ${NAME_TOKEN} لتقديم عرض على طلب معدات.`,
    introNoName: "أنت مدعوٌّ لتقديم عرض على طلب معدات.",
    signoff: `شكراً لك،\n${NAME_TOKEN}`,
    signoffNoName: "شكراً لك،",
  },
} as const;

/** The wording a renter starts with, before he has changed anything. */
export function defaultTemplate(lang: "en" | "ar" = "en"): ShareTemplate {
  const d = DEFAULTS[lang];
  return { greeting: d.greeting, intro: d.intro, signoff: d.signoff };
}

/**
 * The wording for a renter we cannot name — the untouched default only, never his own text.
 *
 * A field he has edited is his, and is sent as he typed it with the token taken out. A field he has
 * left alone is ours to phrase properly.
 */
function withoutName(field: "intro" | "signoff", value: string, lang: "en" | "ar"): string | null {
  const d = DEFAULTS[lang];
  if (field === "intro" && value === d.intro) return d.introNoName;
  if (field === "signoff" && value === d.signoff) return d.signoffNoName;
  return null;
}

const key = (lang: "en" | "ar") => `moeda.shareTemplate.${lang}`;

/**
 * His saved wording, or the default.
 *
 * Every read is guarded: private mode, blocked storage and a half-written value are all ordinary,
 * and none of them is worth a screen that will not draw. A missing field falls back to its default
 * rather than to an empty string — a template saved before a field existed must not silently delete
 * the greeting from every message he sends.
 */
export function loadTemplate(lang: "en" | "ar" = "en"): ShareTemplate {
  const base = defaultTemplate(lang);
  try {
    const raw = window.localStorage.getItem(key(lang));
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ShareTemplate>;
    return {
      greeting: typeof saved.greeting === "string" ? saved.greeting : base.greeting,
      intro: typeof saved.intro === "string" ? saved.intro : base.intro,
      signoff: typeof saved.signoff === "string" ? saved.signoff : base.signoff,
    };
  } catch {
    return base;
  }
}

export function saveTemplate(t: ShareTemplate, lang: "en" | "ar" = "en"): void {
  try {
    window.localStorage.setItem(key(lang), JSON.stringify(t));
  } catch {
    /* nothing here is worth a broken share */
  }
}

export function clearTemplate(lang: "en" | "ar" = "en"): void {
  try {
    window.localStorage.removeItem(key(lang));
  } catch {
    /* as above */
  }
}

/** Has he changed anything? Drives whether *Reset to default* is worth offering. */
export function isDefaultTemplate(t: ShareTemplate, lang: "en" | "ar" = "en"): boolean {
  const d = defaultTemplate(lang);
  return t.greeting === d.greeting && t.intro === d.intro && t.signoff === d.signoff;
}

/**
 * Fill `{name}`.
 *
 * An unnamed renter loses the token AND the punctuation around it, rather than sending
 * "Thanks,\n" with a blank line where a company should be, or " invites you to bid".
 */
export function fillName(text: string, renterName: string | null | undefined): string {
  const name = renterName?.trim();
  if (name) return text.split(NAME_TOKEN).join(name);
  return text
    .split("\n")
    .map((line) => line.split(NAME_TOKEN).join("").replace(/\s{2,}/g, " ").trim())
    .filter((line, i, all) => line !== "" || (i > 0 && i < all.length - 1))
    .join("\n")
    .trim();
}

/**
 * The template as the renter reads it on screen, with the card's own block shown as one fixed piece.
 *
 * Kept beside the renderer so the preview and the sent message cannot come from two places.
 */
export interface ShareMessageParts {
  greeting: string;
  intro: string;
  /** Ours. Not editable. */
  card: string;
  signoff: string;
  url: string;
}

/**
 * The message, in parts.
 *
 * ⚠️ **The link is last, on its own line, and that is not a style choice.** WhatsApp draws its
 * preview card from the message the composer holds, and with a `wa.me` prefill it only reliably
 * finds a URL that ends the message — put a sentence after it and the card does not appear, which
 * is exactly the report: *"when i click share the template from the web the template is not shown
 * but when i send it then copy paste through whatsapp it is shown"* (owner, 2026-09-02). Pasting
 * re-runs the composer's own scan, which is why the manual route worked and the prefill did not.
 */
export function shareMessageParts(
  m: BidCardModel,
  url: string,
  {
    template,
    renterName,
    note,
    lang = "en",
  }: { template?: ShareTemplate; renterName?: string | null; note?: string | null; lang?: "en" | "ar" } = {},
): ShareMessageParts {
  const tpl = template ?? defaultTemplate(lang);
  const own = note?.trim();

  const named = !!renterName?.trim();
  const intro = named
    ? fillName(tpl.intro, renterName)
    : (withoutName("intro", tpl.intro, lang) ?? fillName(tpl.intro, renterName));
  const signoff = named
    ? fillName(tpl.signoff, renterName)
    : (withoutName("signoff", tpl.signoff, lang) ?? fillName(tpl.signoff, renterName));

  return {
    greeting: fillName(tpl.greeting, renterName),
    // The renter's line for THIS request sits under his standing intro: the standing one says who
    // is asking, and the one-off says what is special about today. Above the card either way — it
    // is the part a person actually reads, and under the details it would be read after the
    // decision was already made.
    intro: [intro, own || null].filter(Boolean).join("\n\n"),
    card: cardBlock(m, lang),
    signoff,
    url,
  };
}

/** The same parts, joined — what actually goes into the compose window. */
export function renderShareMessage(
  m: BidCardModel,
  url: string,
  opts: { template?: ShareTemplate; renterName?: string | null; note?: string | null; lang?: "en" | "ar" } = {},
): string {
  const p = shareMessageParts(m, url, opts);
  return [p.greeting, p.intro, p.card, p.signoff, p.url]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FIXED = {
  en: { noAccount: "No account is needed. The link opens the form.", closed: "This request is no longer accepting bids." },
  ar: { noAccount: "لا حاجة لحساب. الرابط يفتح النموذج مباشرة.", closed: "لم يعد هذا الطلب يقبل العروض." },
} as const;

/**
 * Ours, and fixed.
 *
 * Nothing is invented: a request with no terms prints no term lines, one with no deadline prints no
 * closing line. What the request does not carry does not appear, which is the same rule the image
 * and the HTML card follow.
 */
export function cardBlock(m: BidCardModel, lang: "en" | "ar" = "en"): string {
  const t = FIXED[lang];
  const lines: (string | null)[] = [
    /**
     * The machine, and only the machine (owner, 2026-09-03: *"remove any request code from the
     * templates"*).
     *
     * ~~The reference led it, so an operator could file the reply without opening the link.~~ That
     * is our filing, not his: a supplier reading `CEX-020902:` before the equipment is being handed
     * an internal code as the first thing he sees, and it buys him nothing he cannot get from the
     * link. The card still carries it, small and to one side, where somebody who wants to quote it
     * can find it.
     */
    m.imageHeadline,

    // The SITE and the DATES first, and once: they belong to the request, not to any one machine.
    m.where || null,

    // Then what every machine agrees on — also the request's own answers.
    ...(m.terms.length ? ["", ...m.terms.map((x) => `${x.label}: ${x.value}`)] : []),

    /**
     * Then each machine, with only the terms IT carries.
     *
     * The image can name one headline; this is where the rest of the request lives. A machine whose
     * every answer is shared prints as a bare line, which is the truth — there is nothing about it
     * the block above has not already said.
     */
    ...(m.items.length
      ? [
          "",
          ...m.items.flatMap((i) => [
            `• ${[i.label, i.units].filter(Boolean).join(" ")}`,
            ...i.terms.map((x) => `   ${x.label}: ${x.value}`),
          ]),
        ]
      : []),

    m.closing ? "" : null,
    m.closing,
    "",
    m.accepting ? t.noAccount : t.closed,
  ];

  return lines
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
