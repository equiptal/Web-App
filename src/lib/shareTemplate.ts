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
  /**
   * The subject line, and his to write.
   *
   * ⚠️ It was ours, built from `t.subject` on every render, so a renter could read it and not
   * change it (owner, 2026-09-05: *"make the template title editable"*). It carries
   * `{equipment}` for the same reason the body carries `{name}`: the wording is his and stays put
   * across requests, while the machine it names changes every time.
   */
  title: string;
  /**
   * Everything above the card, as ONE box.
   *
   * ⚠️ ~~A greeting field and an intro field.~~ Two boxes for two sentences that are always
   * read as one paragraph (owner, 2026-09-05: *"no need to seperate the edit per hello or per you
   * are invited etc, keep them one text box above the card"*). Splitting them made the renter place
   * his cursor twice to change one thought, and it fixed a blank line between them he could not
   * remove.
   */
  above: string;
  /** Everything below the card, as one box: the sign-off, and anything else he wants to add. */
  below: string;
}

/**
 * The two placeholders, spelled the same in both languages so a renter who switches keeps his
 * wording. Anything else he types is his own text and is sent verbatim.
 */
export const NAME_TOKEN = "{name}";
export const EQUIPMENT_TOKEN = "{equipment}";

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
    title: `RFQ for ${EQUIPMENT_TOKEN}`,
    above: `Hello,\n\n${NAME_TOKEN} invites you to bid on my equipment request.`,
    aboveNoName: "Hello,\n\nYou are invited to bid on my equipment request.",
    below: `Thanks,\n${NAME_TOKEN}`,
    belowNoName: "Thanks,",
  },
  ar: {
    title: `طلب عرض سعر لـ ${EQUIPMENT_TOKEN}`,
    above: `مرحباً،\n\nيدعوك ${NAME_TOKEN} لتقديم عرض على طلب معدات.`,
    aboveNoName: "مرحباً،\n\nأنت مدعوٌّ لتقديم عرض على طلب معدات.",
    below: `شكراً لك،\n${NAME_TOKEN}`,
    belowNoName: "شكراً لك،",
  },
} as const;

/**
 * The channels that carry a message, and therefore the ones that can carry different wording.
 *
 * ⚠️ **Moedatech is not among them.** Posting to Moedatech sends no message at all: the request
 * lands in the marketplace and suppliers read it there. A template for it would be wording nobody
 * ever receives.
 */
export const SHARE_CHANNELS = ["email", "whatsapp", "other"] as const;
export type ShareChannelKey = (typeof SHARE_CHANNELS)[number];

/** One wording per channel (owner, 2026-09-05: *"different template per channel"*). */
export type ShareTemplateSet = Record<ShareChannelKey, ShareTemplate>;

/**
 * Which wording a channel reads.
 *
 * ⚠️ Moedatech-only still has to show a preview, and it shows the e-mail one: it is the longest
 * of the three and the one a renter is most likely to be about to use. Showing nothing would leave
 * the column blank on the state a renter reaches by doing nothing.
 */
export const channelKey = (channel: string | null | undefined): ShareChannelKey =>
  channel === "whatsapp" || channel === "other" ? channel : "email";

/** The wording a renter starts with, before he has changed anything. */
export function defaultTemplate(lang: "en" | "ar" = "en"): ShareTemplate {
  const d = DEFAULTS[lang];
  return { title: d.title, above: d.above, below: d.below };
}

/**
 * The wording for a renter we cannot name — the untouched default only, never his own text.
 *
 * A field he has edited is his, and is sent as he typed it with the token taken out. A field he has
 * left alone is ours to phrase properly.
 */
function withoutName(field: "above" | "below", value: string, lang: "en" | "ar"): string | null {
  const d = DEFAULTS[lang];
  if (field === "above" && value === d.above) return d.aboveNoName;
  if (field === "below" && value === d.below) return d.belowNoName;
  return null;
}

const key = (lang: "en" | "ar") => `moeda.shareTemplate.${lang}`;

/** The three, all starting from the same wording: differing them is his choice, not our guess. */
export function defaultTemplateSet(lang: "en" | "ar" = "en"): ShareTemplateSet {
  const d = defaultTemplate(lang);
  return { email: { ...d }, whatsapp: { ...d }, other: { ...d } };
}

const isTemplate = (v: unknown): v is ShareTemplate =>
  !!v && typeof v === "object" && ["title", "above", "below"].some((k) => typeof (v as Record<string, unknown>)[k] === "string");

/** One channel's wording out of a stored blob, field by field, falling back per field. */
function readOne(raw: unknown, base: ShareTemplate, legacy: ShareTemplate | null): ShareTemplate {
  const o = (raw ?? {}) as Partial<ShareTemplate>;
  const from = legacy ?? base;
  return {
    title: typeof o.title === "string" ? o.title : from.title,
    above: typeof o.above === "string" ? o.above : from.above,
    below: typeof o.below === "string" ? o.below : from.below,
  };
}

/**
 * The wording behind an OLDER blob, whatever shape it was in.
 *
 * 🔴 **Two migrations live here, and both protect writing a renter did once and expects to keep.**
 * That is the only reason any of this is stored.
 *
 *   - `{greeting, intro, signoff}` — before the boxes merged. Greeting and intro rejoin with the
 *     blank line that always sat between them on screen.
 *   - `{title, above, below}` — before the channels split. It becomes the wording of ALL THREE,
 *     because that is what he meant when he wrote it: at the time it was the only template there
 *     was, and it went out on every channel.
 */
function legacyTemplate(saved: Record<string, unknown>, base: ShareTemplate): ShareTemplate | null {
  const g = typeof saved.greeting === "string" ? saved.greeting : null;
  const i = typeof saved.intro === "string" ? saved.intro : null;
  const sg = typeof saved.signoff === "string" ? saved.signoff : null;
  const flat = isTemplate(saved) ? (saved as unknown as Partial<ShareTemplate>) : null;

  if (!g && !i && !sg && !flat) return null;
  return {
    title: typeof flat?.title === "string" ? flat.title : base.title,
    above:
      typeof flat?.above === "string"
        ? flat.above
        : g || i
          ? [g, i].filter((v): v is string => !!v && v.trim() !== "").join("\n\n")
          : base.above,
    below: typeof flat?.below === "string" ? flat.below : (sg ?? base.below),
  };
}

/**
 * His saved wording for every channel, or the defaults.
 *
 * Every read is guarded: private mode, blocked storage and a half-written value are all ordinary,
 * and none of them is worth a screen that will not draw.
 */
export function loadTemplates(lang: "en" | "ar" = "en"): ShareTemplateSet {
  const base = defaultTemplateSet(lang);
  try {
    const raw = window.localStorage.getItem(key(lang));
    if (!raw) return base;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const legacy = legacyTemplate(saved, base.email);
    return {
      email: readOne(saved.email, base.email, legacy),
      whatsapp: readOne(saved.whatsapp, base.whatsapp, legacy),
      other: readOne(saved.other, base.other, legacy),
    };
  } catch {
    return base;
  }
}

/** One channel's wording. */
export function loadTemplate(lang: "en" | "ar" = "en", channel: ShareChannelKey = "email"): ShareTemplate {
  return loadTemplates(lang)[channel];
}

export function saveTemplates(set: ShareTemplateSet, lang: "en" | "ar" = "en"): void {
  try {
    window.localStorage.setItem(key(lang), JSON.stringify(set));
  } catch {
    /* nothing here is worth a broken share */
  }
}

export function clearTemplates(lang: "en" | "ar" = "en"): void {
  try {
    window.localStorage.removeItem(key(lang));
  } catch {
    /* as above */
  }
}

/** Has he changed THIS channel's wording? Drives whether *Reset to default* is worth offering. */
export function isDefaultTemplate(t: ShareTemplate, lang: "en" | "ar" = "en"): boolean {
  const d = defaultTemplate(lang);
  return t.title === d.title && t.above === d.above && t.below === d.below;
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
 * Fill `{equipment}` in the subject.
 *
 * ⚠️ Simpler than `fillName` on purpose. A missing machine name means the request has no
 * equipment on it yet, which is a state the panel already refuses to preview, so there is no
 * "sentence without a slot" to rescue — the token simply goes, and the renter's own words stand.
 */
export function fillEquipment(text: string, equipment: string | null | undefined): string {
  const e = equipment?.trim();
  return text.split(EQUIPMENT_TOKEN).join(e ?? "").replace(/\s{2,}/g, " ").trim();
}

/**
 * The template as the renter reads it on screen, with the card's own block shown as one fixed piece.
 *
 * Kept beside the renderer so the preview and the sent message cannot come from two places.
 */
export interface ShareMessageParts {
  /** The subject line, tokens filled. Not part of the body. */
  title: string;
  above: string;
  /** Ours. Not editable. */
  card: string;
  below: string;
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
  const above = named
    ? fillName(tpl.above, renterName)
    : (withoutName("above", tpl.above, lang) ?? fillName(tpl.above, renterName));
  const below = named
    ? fillName(tpl.below, renterName)
    : (withoutName("below", tpl.below, lang) ?? fillName(tpl.below, renterName));

  return {
    title: fillEquipment(fillName(tpl.title, renterName), m.imageHeadline),
    // The renter's line for THIS request sits under his standing wording: the standing one says who
    // is asking, and the one-off says what is special about today. Above the card either way — it
    // is the part a person actually reads, and under the details it would be read after the
    // decision was already made.
    above: [above, own || null].filter(Boolean).join("\n\n"),
    card: cardBlock(m, lang),
    below,
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
  return [p.above, p.card, p.below, p.url]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FIXED = {
  /**
   * ⚠️ ~~"No account is needed. The link opens the form."~~ Removed (owner, 2026-09-05).
   *
   * It answered a question nobody had asked yet, in the place a supplier reads the terms he is about
   * to price, and it ended every message on a note about US rather than about the job. The bid page
   * itself makes the point better by simply opening.
   *
   * The CLOSED line stays. It is not reassurance, it is the one fact that changes what a supplier
   * does with the link: a request that no longer takes bids and does not say so wastes his time.
   */
  en: { closed: "This request is no longer accepting bids." },
  ar: { closed: "لم يعد هذا الطلب يقبل العروض." },
} as const;

/**
 * Ours, and fixed.
 *
 * Nothing is invented: a request with no terms prints no term lines, one with no deadline prints no
 * closing line. What the request does not carry does not appear, which is the same rule the image
 * and the HTML card follow.
 */
export function cardBlock(
  m: BidCardModel,
  lang: "en" | "ar" = "en",
  /**
   * Drop the machine name and the site — for the HTML message, where the CARD above already
   * carries both. In plain text there is no card, so they must stay.
   */
  { omitHead = false }: { omitHead?: boolean } = {},
): string {
  const t = FIXED[lang];

  /**
   * ── One fact per line (owner, 2026-09-03) ────────────────────────────────────────────────────
   *
   * *"i want them as points not like this will never be read by user."*
   *
   * ~~Every term joined by middots into one paragraph.~~ Nine facts in a run-on sentence is a thing
   * a supplier's eye slides off, and the DEADLINE — the line that decides whether he acts today or
   * next week — sat in the middle of it.
   *
   * A line each, and a chat bubble has width for a line. Nothing is invented: what the request does
   * not answer produces no line, because "Fuel: —" teaches him to skim the block and then he skims
   * the one that mattered.
   */
  const lines: (string | null)[] = [
    /**
     * ⚠️ The machine leads, and it must: e-mail has no card at all, so if the name is not in these
     * words a supplier reading an e-mail never learns what he is being asked to price. The picture
     * carries it too, but a picture is not readable with images off, in a text client, or by SMS.
     *
     * Dropped only when the list below names every machine — then the headline would be the first
     * of them said twice.
     */
    omitHead || m.items.length ? null : m.imageHeadline,

    // The site and the dates belong to the request, not to any one machine.
    omitHead ? null : m.where || null,

    ...(m.terms.length ? ["", ...m.terms.map((x) => `• ${x.label}: ${x.value}`)] : []),

    /**
     * Then each machine, with only the terms IT carries. A machine whose every answer is shared
     * prints as a bare line, which is the truth — there is nothing about it the block above has
     * not already said.
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
    // Only when it is closed. An open request says nothing here at all.
    ...(m.accepting ? [] : ["", t.closed]),
  ];

  return lines
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/*
 * -- On his account, rather than in this browser -------------------------------------------------
 *
 * Built on 2026-09-05 and taken back out the same day (owner: *"keep it as a note but for now keep
 * it browser"*). `fetchAccountTemplates`, `saveAccountTemplates` and `loadStore` lived here, over a
 * table in the partners domain.
 *
 * ⚠️ **This is per BROWSER, and that is the whole of its limit.** It survives closing the tab and
 * months of not using it; it does not survive a second laptop, a phone, a different browser, or
 * cleared site data. A renter who writes his wording at the office and shares from his phone on
 * site meets our default.
 *
 * The design, the migration, the handler and its eleven tests are kept verbatim in
 * `docs/implementation-plans/renter-suppliers/share-template-on-account.md`, so restoring it is
 * copy-and-paste rather than a redesign.
 */
