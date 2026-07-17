/**
 * Negotiation-round reconstruction from the deal-room chat (app parity — deal_room/data/negotiation_rounds.dart).
 *
 * There is NO rounds endpoint. The app rebuilds the price/units history from the GetStream `rate_proposal`
 * messages. The backend nests the round payload under the message's `custom` object (Dart reads it as
 * `extraData['custom']`; the JS SDK exposes the same object as `message.custom`, and some fields may be
 * spread onto the message root). We read BOTH defensively and fall back gracefully — if nothing is
 * reachable, callers use the room-payload values (never break the live flow).
 */

export type RoundRole = "supplier" | "rentee";

export interface DealRound {
  role: RoundRole;
  rate: number | null;
  priceUnit: string | null;
  mobPrice: number | null;
  demobPrice: number | null;
  rentalUnits: number | null;
  mobUnits: number | null;
  demobUnits: number | null;
  mobExcluded: boolean;
  demobExcluded: boolean;
  at: string | null;
}

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
};
const str = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s.trim() ? s : null;
};

/** Read the round payload off a raw Stream message — prefer `message.custom`, fall back to the root. */
function proposalOf(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const custom = m.custom && typeof m.custom === "object" ? (m.custom as Record<string, unknown>) : {};
  // Merge with `custom` winning; the app's `type:'rate_proposal'` lives in custom (Stream's own
  // `message.type` is 'regular'/'system'/… and must not be confused with it).
  const merged = { ...m, ...custom };
  const type = custom.type ?? merged.customType ?? merged.messageKind;
  if (type !== "rate_proposal") return null;
  return merged;
}

/** Map the chat's `rate_proposal` messages → rounds, oldest-first (chat order). */
export function reconstructRounds(rawMessages: unknown[]): DealRound[] {
  const out: DealRound[] = [];
  for (const raw of rawMessages ?? []) {
    const p = proposalOf(raw);
    if (!p) continue;
    const role = String(p.proposedByRole ?? p.role ?? "").toLowerCase() === "supplier" ? "supplier" : "rentee";
    out.push({
      role,
      rate: num(p.proposedRate ?? p.rate),
      priceUnit: str(p.priceUnit),
      mobPrice: num(p.mobPrice),
      demobPrice: num(p.demobPrice),
      rentalUnits: num(p.rentalUnits),
      mobUnits: num(p.mobUnits),
      demobUnits: num(p.demobUnits),
      mobExcluded: p.mobExcluded === true,
      demobExcluded: p.demobExcluded === true,
      at: str((raw as Record<string, unknown>).created_at) ?? str(p.at),
    });
  }
  return out;
}

/** Fold CONSECUTIVE same-role rounds — an edit-while-waiting supersedes the earlier one (keep latest). */
export function collapseRounds(rounds: DealRound[]): DealRound[] {
  const out: DealRound[] = [];
  for (const r of rounds) {
    const last = out[out.length - 1];
    if (last && last.role === r.role) out[out.length - 1] = r;
    else out.push(r);
  }
  return out;
}

/** Latest round proposed by a given party (null if none). */
export function latestRoundBy(rounds: DealRound[], role: RoundRole): DealRound | null {
  for (let i = rounds.length - 1; i >= 0; i--) if (rounds[i].role === role) return rounds[i];
  return null;
}

/** Synthesize the supplier's opening round from the room's standing values, so the history always has a
 *  supplier round-0 even before any counter (app parity: openingBid). Best-effort — the room flattens
 *  the bid, so these are the current on-table numbers. */
export function withOpeningRound(
  rounds: DealRound[],
  opening: {
    rate: number | null; priceUnit: string | null; mobPrice: number | null; demobPrice: number | null;
    rentalUnits: number | null; mobUnits: number | null; demobUnits: number | null;
    mobExcluded: boolean; demobExcluded: boolean;
  },
): DealRound[] {
  if (rounds.length > 0 && rounds[0].role === "supplier") return rounds;
  return [{ role: "supplier", at: null, ...opening }, ...rounds];
}
