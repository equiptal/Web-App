/**
 * The quotation's TERM SENTENCES, shared by both documents (the workspace's bid quotation and the
 * deal room's).
 *
 * 🔴 Ported from the app's `_clausesForBid` (`live_quotation_document.dart`). The app's own reason
 * for the shape, on the owner's instruction: *"can we make them fixed sentances that uses terms
 * values in the placeholder? instead of grouping them into 3 terms"*. ~~Three titled buckets
 * (commercial / operational / logistics), each holding a comma-run of `label: value` pairs.~~ That
 * reads as a form dump, not as terms anybody agreed to, and a quotation is signed on.
 *
 * 🔴 **The VALUE ladder is the whole point, and it is the terms modal's own**: deal-room LOCKED value
 * → latest counter → the supplier's declaration → the request's own side. A clause can therefore
 * never state a term the room contradicts.
 *
 * 🔴 **NO TERM MAY BE MISSING** (owner, 2026-09-18, on the app: *"just make sure agreed and all terms
 * of deal room is mentioned, we will not miss anything"*). The sentences below cover the terms
 * somebody wrote a sentence for; `extraTermClauses` sweeps up every other key the room holds and
 * prints it as `label: value`, so an agreed term can never fall off the paper the customer was sent.
 */

import type { QuotationClause } from "@/lib/quotation/render";

export type LFn = (en: string, ar: string) => string;

/**
 * Everything a clause needs to resolve one term, in the ladder's own order.
 *
 * `hidden` is passed IN rather than imported, so this module depends on nothing in `contract/` and
 * cannot close a cycle with the deal room, which imports it.
 */
export interface TermSource {
  /** Settled in the room — strictly `state === "agreed"` (`lockedTerms`). */
  locked: Map<string, unknown>;
  /** The latest counter's proposed value, per term. */
  counter: Map<string, unknown>;
  /** The supplier's own declaration (T3). */
  declared: Map<string, unknown>;
  /** The request's side of a term, when it has one. */
  requestSide?: (key: string) => unknown;
  /** Retired / priced keys this document must not print. */
  hidden: (key: string) => boolean;
  /** `key` → the reader's label. */
  label: (key: string) => string;
  /** `key`, raw value → the reader's value. */
  value: (key: string, value: unknown) => string;
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : null;
  const t = String(v).trim();
  return t.length ? t : null;
};

/** The ladder: locked → counter → declared → the request's own side. */
export function resolveTerm(src: TermSource, key: string): string | null {
  return (
    str(src.locked.get(key)) ??
    str(src.counter.get(key)) ??
    str(src.declared.get(key)) ??
    str(src.requestSide?.(key)) ??
    null
  );
}

/** Settled in the room. `lockedTerms` and nothing else — the room's SOFT-ACCEPTED set is "nobody may
 *  act on this", never "both sides agreed", and this is a document a customer keeps. */
export const isAgreedTerm = (src: TermSource, key: string): boolean => src.locked.has(key);

/** One clause, with its term key recorded so the sweep below does not print it twice. */
export class ClauseList {
  readonly out: QuotationClause[] = [];
  readonly covered = new Set<string>();

  add(title: string, body: string, termKey?: string, src?: TermSource) {
    if (termKey) this.covered.add(termKey);
    this.out.push({ title, body, agreed: !!(termKey && src && isAgreedTerm(src, termKey)) });
  }
}

/** `Payment terms Net 60. A formal purchase order …` and the other seven, in the app's own wording. */
export const CLAUSE = {
  scopeTitle: (L: LFn) => L("Scope", "النطاق"),
  scope: (L: LFn, scope: string, duration: string | null) =>
    duration ? L(`${scope}, for ${duration}`, `${scope}، لمدة ${duration}`) : scope,
  transportTitle: (L: LFn) => L("Transport", "النقل"),
  transport: (L: LFn, toSite: boolean, fromSite: boolean) =>
    toSite && fromSite
      ? L("The price covers delivery to site and return from it", "السعر شامل نقل المعدة إلى الموقع وإعادتها منه")
      : toSite
        ? L("The price covers delivery to site. Return from site is the renter's responsibility", "السعر شامل نقل المعدة إلى الموقع. إعادتها من الموقع على المستأجر")
        : fromSite
          ? L("The price covers return from site. Delivery to site is the renter's responsibility", "السعر شامل إعادة المعدة من الموقع. نقلها إلى الموقع على المستأجر")
          : L("Delivery to site and return from it are the renter's responsibility", "نقل المعدة إلى الموقع وإعادتها منه على المستأجر"),
  operatorTitle: (L: LFn) => L("Operator", "المشغل"),
  operatorIncluded: (L: LFn, detail: string | null) =>
    detail ? L(`Included in this quotation: ${detail}`, `مشمول بهذا العرض: ${detail}`) : L("Included in this quotation", "مشمول بهذا العرض"),
  operatorNone: (L: LFn) =>
    L("Not included in this quotation. The renter supplies a qualified, licensed operator", "غير مشمول بهذا العرض. يوفّر المستأجر مشغلاً مؤهلاً ومرخصاً"),
  certsTitle: (L: LFn) => L("Certifications", "الشهادات"),
  certs: (L: LFn, certs: string) =>
    L(`${certs}, valid for the whole rental period`, `${certs}، سارية طوال مدة الإيجار`),
  paymentTitle: (L: LFn) => L("Payment", "السداد"),
  payment: (L: LFn, terms: string) =>
    L(`Payment terms ${terms}. A formal purchase order is issued on approval of this quotation`, `شروط السداد ${terms}. يصدر أمر شراء رسمي عند اعتماد هذا العرض`),
  breakdownTitle: (L: LFn) => L("Breakdowns", "الأعطال"),
  breakdown: (L: LFn, sla: string) =>
    L(`The supplier responds to any breakdown within ${sla}`, `يلتزم المورّد بالاستجابة لأي عطل خلال ${sla}`),
  maintenanceTitle: (L: LFn) => L("Maintenance", "الصيانة"),
  maintenance: (L: LFn, party: string) =>
    L(`Routine maintenance is carried by ${party} for the rental period`, `الصيانة الدورية على ${party} طوال فترة الإيجار`),
  attachmentsTitle: (L: LFn) => L("Attachments", "الملحقات"),
};

/**
 * Every term the room holds that no sentence above covered, as `label: value`.
 *
 * ⚠️ A bare pair reads worse than a sentence, and it reads far better than an agreed term the
 * customer cannot find on the paper they were sent.
 *
 * ⚠️ The UNION of all three sources, not only the locked list: a term the supplier declared and one
 * still under counter both belong on a quotation — the first is what is being offered, the second is
 * where the negotiation stands.
 *
 * ⚠️ Agreed first (a settled term outranks one still moving), then by key, so two renders of the same
 * bid cannot order them differently.
 */
export function extraTermClauses(src: TermSource, covered: ReadonlySet<string>): QuotationClause[] {
  const keys = [...new Set([...src.locked.keys(), ...src.counter.keys(), ...src.declared.keys()])].filter(
    (k) => k && !covered.has(k) && !src.hidden(k),
  );
  keys.sort((a, b) => {
    const la = src.locked.has(a) ? 0 : 1;
    const lb = src.locked.has(b) ? 0 : 1;
    return la !== lb ? la - lb : a.localeCompare(b);
  });
  const out: QuotationClause[] = [];
  for (const key of keys) {
    const raw = resolveTerm(src, key);
    if (!raw) continue;
    out.push({ title: src.label(key), body: src.value(key, raw), agreed: isAgreedTerm(src, key) });
  }
  return out;
}
