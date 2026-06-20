import type { TermRow } from "@/lib/contract/bids";

/**
 * Roll a class's rows up to one status: a conflict dominates (red), then an active negotiation
 * (orange), then all-settled (green) — otherwise neutral (nothing declared/verified yet).
 */
function rollup(rows: TermRow[]): { state: "bad" | "warn" | "ok" | "neutral"; icon: string; ok: number } {
  const ok = rows.filter((r) => r.state === "matched" || r.state === "agreed").length;
  const conflict = rows.some((r) => r.state === "conflict");
  const negotiating = rows.some((r) => r.state === "negotiating");
  if (conflict) return { state: "bad", icon: "error", ok };
  if (negotiating) return { state: "warn", icon: "sync", ok };
  if (ok > 0 && ok === rows.length) return { state: "ok", icon: "check_circle", ok };
  if (ok > 0) return { state: "warn", icon: "remove_circle_outline", ok };
  return { state: "neutral", icon: "remove_circle_outline", ok };
}

/**
 * Per-class term status on the bid card (app parity — Equipment / Project / Supplier). Each class is
 * one status chip: an icon + label + an "settled / total" fraction, colored by the worst issue in the
 * class. Tapping the row (parent) expands the inline Terms panel listing each term's status.
 */
export function TermClassBadges({
  terms,
  ar,
}: {
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] };
  ar: boolean;
}) {
  const L = (en: string, arr: string) => (ar ? arr : en);
  const classes = [
    { label: L("Equipment", "المعدة"), rows: terms.equipment },
    { label: L("Project", "المشروع"), rows: terms.contract },
    { label: L("Supplier", "المؤجّر"), rows: terms.supplier },
  ].filter((c) => c.rows.length > 0);

  return (
    <div className="term-classes">
      {classes.map((c) => {
        const { state, icon, ok } = rollup(c.rows);
        return (
          <span key={c.label} className={`tcls tcls-${state}`}>
            <span className="material-icons-outlined">{icon}</span>
            <span className="tcls-lab">{c.label}</span>
            <span className="tcls-frac">{ok}/{c.rows.length}</span>
          </span>
        );
      })}
    </div>
  );
}
