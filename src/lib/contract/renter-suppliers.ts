/**
 * SUP-T11 — the renter's own supplier list.
 *
 * A row here is a **link between a company and a supplier**, never a field on the supplier's own
 * account. The same firm is a registered vendor for one renter and not for another, so the flag —
 * and the groups, and the contact the renter keeps — live on the link and nowhere else. The supplier
 * is never told, and another renter's view of the same firm never changes.
 *
 * The list is read on the My Suppliers screen, feeds the recipient picker when a request is shared,
 * and feeds the supplier picker when a project award is made.
 *
 * ── Two kinds, and one of them is not a copy ─────────────────────────────────────────────────────
 *
 * `platform` points at a Moedatech account: `name` and `store` are the account's, read live, so a
 * rename over there reaches the renter here. `own` is a firm the renter typed in or imported, and the
 * row carries its name itself because there is no account to read.
 *
 * **A row moves from `own` to `platform` on its own** when its CR or phone turns out to match an
 * account (plan §M2). It keeps its groups, its flag and its imported columns. So `kind` is a fact
 * about the supplier today, never a record of how the row was created — which is why the table shows
 * an "On Moedatech" badge and not a source column.
 *
 * ── NO React, NO DOM, NO i18n ───────────────────────────────────────────────────────────────────
 *
 * Same rule as every other contract module: this shape is read by the screen, by the award dialog and
 * by the share sheet, and none of them may pull a component or a locale in through it.
 */

/** Whether the supplier has a Moedatech account. Never a record of how the row was created. */
export type RenterSupplierKind = "platform" | "own";

/** How the row first arrived. Kept for support ("where did this come from?"), never for logic. */
export type RenterSupplierSource = "platform" | "manual" | "sheet" | "link_bid";

/**
 * What has passed between this renter and this supplier, counted by the backend.
 *
 * **Computed server-side, deliberately.** A company with two hundred suppliers would otherwise cost
 * one request per supplier on every page load.
 *
 * `newBids` is absent until SUP-BE-13: it is "since *you* last looked", which needs a per-user seen
 * state that Phase 3 adds. Undefined therefore means *not answered yet*, not zero — the badge is not
 * drawn rather than drawn empty.
 */
export interface SupplierRollup {
  /** Bids this supplier made inside the app. */
  bidsApp: number;
  /** Bids that arrived through the renter's shared link form. */
  bidsLink: number;
  /** ISO. Null when they have never bid. */
  lastBidAt: string | null;
  /** Deal rooms opened between the two. */
  rooms: number;
  /** Project awards carrying this row's supplier id. */
  awards: number;
  /** Bids since this user last opened the list. Undefined until the backend answers it. */
  newBids?: number;
}

/**
 * One link row.
 *
 * **Extended, never forked** — `AwardDialog` already imports this type, and a parallel shape would
 * drift from it the first time either changed.
 */
export interface RenterSupplier {
  /** The LINK's id — not the supplier's. */
  id: string;
  kind: RenterSupplierKind;
  /**
   * The Moedatech account behind the row. Null for `own`.
   *
   * **A number on the wire.** The backend serializes its own `supplierUserId` column, which is an
   * integer — so anything comparing this to a store's id or to a picker value must `String()` both
   * sides. Typed as it actually arrives rather than as we would have liked it, because a lie here is
   * the exact class of bug the agents-contract test exists to catch.
   */
  supplierId?: string | number | null;
  /** The account's name for `platform`, the renter's own for `own`. */
  name: string;
  /** The renter's flag, and the renter's alone. */
  vendorRegistered: boolean;

  /** The person the renter deals with. Always the renter's own note. */
  contactName?: string | null;
  /**
   * Contact the renter can use.
   *
   * For an `own` row this is what the renter typed. For a `platform` row it may be the account's own
   * details — **provisional, behind a server-side switch (SUP-BE-20)**. Either way the rule for a
   * reader is the same: **null means there is no way to reach them yet**, and the screen says so
   * rather than inventing one. Nothing here may assume the fields are present.
   */
  email?: string | null;
  phone?: string | null;
  /** Commercial registration — the strongest matching key we hold (plan §M0). */
  crNumber?: string | null;

  /** Flat labels. A group is only ever a way to pick who a request goes to. */
  groups?: string[];
  /** Whatever columns the renter's own spreadsheet carried and did not map. Pass-through. */
  extra?: Record<string, string>;
  source?: RenterSupplierSource;

  /** The supplier has an open store. `platform` only. */
  store?: boolean;
  /** Moedatech has verified the firm. `platform` only. */
  verified?: boolean;

  /**
   * What the renter typed that could not be turned into a key — a phone the parser refused, a CR
   * that was prose.
   *
   * **Present only when something was dropped**, so the cell can be marked on presence alone. The key
   * column itself stays null, deliberately: a raw value in `phone_e164` would poison every lookup.
   * The text survives here so the renter does not silently lose a cell they believe they imported,
   * and **nothing may ever match on it.**
   */
  unparsed?: Record<string, string>;
  /** ISO. When this row last changed — the list is ordered by it. */
  updatedAt?: string;

  rollup?: SupplierRollup;
}

/** One bid, as the profile lists it. `bidId` is enough to open it in its own request. */
export interface SupplierBid {
  bidId: string;
  requestId: string;
  requestCode: string | null;
  equipment: string;
  site: string | null;
  price: number | null;
  priceUnit: string | null;
  at: string;
  /** Which channel it arrived through — an account holder can use the shared form too. */
  via: "app" | "link";
}

/** One award, as the profile lists it. Only awards carrying a supplier id can appear. */
export interface SupplierAward {
  projectId: string;
  projectTitle: string | null;
  equipment: string;
  units: number;
  price: number | null;
  start: string | null;
  end: string | null;
}

/**
 * Something the renter sent this supplier.
 *
 * `opened` is real — the public bid page is server-rendered and sees the visit. **Nothing here is a
 * delivery confirmation**: the mail leaves from the renter's own client, so a record says what the
 * renter said they sent and never that it arrived.
 */
export interface SupplierSend {
  kind: "share" | "invite";
  requestCode: string | null;
  at: string;
  opened?: boolean;
  joined?: boolean;
}

/** The link row plus the whole history behind it. */
export interface SupplierProfile extends RenterSupplier {
  bids: SupplierBid[];
  awards: SupplierAward[];
  /** Empty until SUP-BE-15 records a share. The key is always present so no reader branches on it. */
  sends: SupplierSend[];
}

/* ── readers ───────────────────────────────────────────────────────────────────────────────────── */

const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

/** Every bid, whichever channel it came through. */
export const bidCount = (s: RenterSupplier): number => (s.rollup?.bidsApp ?? 0) + (s.rollup?.bidsLink ?? 0);

/**
 * Can a request be shared with this supplier?
 *
 * One rule, one place. **No email, no send** — and the share sheet names who it is skipping before
 * the send rather than after, which is only possible because this is a predicate and not a filter
 * buried in the sender.
 */
export const canBeEmailed = (s: RenterSupplier): boolean => !!s.email?.trim();

/**
 * Can this supplier be invited to join Moedatech?
 *
 * Off-platform only: a supplier who already has an account has nothing to join, and offering it would
 * read as "we do not know who you are" to a firm that has been bidding in the app for a year.
 */
export const canBeInvited = (s: RenterSupplier): boolean => s.kind === "own" && canBeEmailed(s);

/**
 * Something the renter typed was kept but could not be used as a key.
 *
 * The row is fine and the supplier is real; one cell needs correcting. The screen marks it and says
 * what was sent, which is the only way the renter finds out — the value they typed is not in the
 * field they typed it into.
 */
export const hasUnparsed = (s: RenterSupplier): boolean => !!s.unparsed && Object.keys(s.unparsed).length > 0;

/** Groups, always an array — a row that carries none is ungrouped, not broken. */
export const groupsOf = (s: RenterSupplier): string[] => arr(s.groups);

/** Every group in the list, with how many rows carry it. Sorted, because a menu has an order. */
export function groupsWithCounts(list: RenterSupplier[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of list) for (const g of groupsOf(s)) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The relationship, in one word.
 *
 * Off two facts the app already holds — did they bid, and did you award them — because a score
 * nobody can explain is worse than no signal at all. `quiet` dims the dots rather than demoting the
 * word: a core vendor who has gone silent is still a core vendor.
 */
export type SupplierTier = "new" | "bidding" | "working" | "core";

export function supplierTier(s: RenterSupplier, now = new Date()): { tier: SupplierTier; dots: number; quiet: boolean } {
  const last = s.rollup?.lastBidAt ? new Date(s.rollup.lastBidAt) : null;
  const quiet = !!last && now.getTime() - last.getTime() > 180 * 86_400_000;
  const awards = s.rollup?.awards ?? 0;
  if (bidCount(s) === 0) return { tier: "new", dots: 0, quiet: false };
  if (awards >= 2) return { tier: "core", dots: 3, quiet };
  if (awards === 1) return { tier: "working", dots: 2, quiet };
  return { tier: "bidding", dots: 1, quiet };
}
