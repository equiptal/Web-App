/**
 * The request details behind a bid-link preview, as separate fields.
 *
 * ── WHY THIS PARSES INSTEAD OF READING FIELDS ─────────────────────────────────────────────────────
 * `GET /public/bid-form/{token}/preview` computes the reference, the equipment lines, the city, the
 * rental basis, the duration and the deadline — and then joins them into exactly two strings, because
 * two strings is the entire Open Graph budget. The structured values never leave the Lambda.
 *
 * Both of the surfaces that can show more than two strings (the generated OG image, and the card we
 * put on the clipboard for Gmail) need those values apart again. Adding them to the response is the
 * right fix and is a small change — but it needs an agents-backend deploy, which we are not doing.
 * So we split the strings back up here.
 *
 * That is only safe because we own both ends and the separators are deliberate, not incidental:
 *
 *   title        `REQ-00082 — Glass Vacuum rental, 1 unit`
 *                 └─ref──┘ ┆ └────────headline─────────┘        ' — ' (U+2014, spaced)
 *   description  `Riyadh · 30-day rental · Awaiting your response`
 *                 └city┘ ┆ └──basis───┘ ┆ └──────status───────┘  ' · ' (U+00B7, spaced)
 *
 * Both separators are identical in Arabic — only the comma inside the headline changes (U+060C), and
 * nothing here splits on commas. See `buildPreviewCopy` in
 * `Moedatech-App/apps/backend-agents/src/handlers/agents/bid-form/getBidFormPreview.ts`.
 *
 * Kept deliberately small and behind one type: when the backend does start returning rows, this file
 * becomes a mapper and its callers don't move.
 */

export interface BidCardRow {
  label: string;
  value: string;
}

export interface BidCardDetails {
  /** `REQ-00082` / `RFQ-00077`, or null for the historical rows that predate the short-code sequence. */
  ref: string | null;
  /** What is being rented and at what scale — `Glass Vacuum rental, 1 unit`. */
  headline: string;
  /** Location and rental basis, whichever of them the request actually carries. */
  rows: BidCardRow[];
  /** The closing line: a deadline, an invitation to respond, or the closed notice. Always present. */
  status: string;
  accepting: boolean;
}

const REF_SEPARATOR = " — ";
const PART_SEPARATOR = " · ";

/** Only `REQ-`/`RFQ-` codes lead a title. Anything else before an em dash is part of the headline. */
const REF_RE = /^(?:REQ|RFQ)-\S+$/;

/**
 * Is this middle part the rental basis rather than the city?
 *
 * The description carries city, basis and status, but drops any of the first two the request doesn't
 * have — so a two-part description is ambiguous by position alone. The basis is recognisable and a
 * city name is not: every English form ends in "rental", and every Arabic form opens with `إيجار`
 * (`durationLabel` / `RENTAL_LABEL` in the backend). So we identify the basis and let the city be
 * whatever is left, rather than the other way round.
 */
function looksLikeRentalBasis(part: string): boolean {
  return /rental$/i.test(part.trim()) || part.trim().startsWith("إيجار");
}

const LABELS = {
  en: { location: "Location", rental: "Rental" },
  ar: { location: "الموقع", rental: "نوع الإيجار" },
} as const;

/**
 * Split a preview's two strings into the fields a detail panel needs.
 *
 * Never throws and never returns a partial object: a description that doesn't match the expected shape
 * degrades to no rows and the whole string as the status, which still renders as a valid card.
 */
export function bidCardDetails(
  { title, description }: { title: string; description: string },
  lang: "en" | "ar" = "en",
  accepting = true,
): BidCardDetails {
  const labels = LABELS[lang];

  const [maybeRef, ...restOfTitle] = title.split(REF_SEPARATOR);
  const hasRef = restOfTitle.length > 0 && REF_RE.test(maybeRef.trim());
  const ref = hasRef ? maybeRef.trim() : null;
  // Rejoin on the separator: an em dash inside the equipment name itself must survive the round trip.
  const headline = (hasRef ? restOfTitle.join(REF_SEPARATOR) : title).trim();

  const parts = description.split(PART_SEPARATOR).map((p) => p.trim()).filter(Boolean);

  // A closed request gets one sentence and no detail — the card says why it can't be bid on, and a
  // location and a rental basis under that would read as an invitation.
  if (!accepting || parts.length <= 1) {
    return { ref, headline, rows: [], status: parts.join(PART_SEPARATOR) || description.trim(), accepting };
  }

  const status = parts[parts.length - 1];
  const leading = parts.slice(0, -1);

  const rows: BidCardRow[] = [];
  for (const part of leading) {
    rows.push({ label: looksLikeRentalBasis(part) ? labels.rental : labels.location, value: part });
  }

  return { ref, headline, rows, status, accepting };
}
