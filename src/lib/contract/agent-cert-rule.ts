import type { AgentDraft } from "./draft";
import { certsForLine, operatorCertsFor } from "./options";
import { isLiftingCategory, type Taxonomy } from "./taxonomy";

/**
 * The renter's WORDS treated as project settings (owner, 2026-10-05; app parity
 * `RfqParseService.withCertRule`).
 *
 * The certs the agent read for each line go through the 2026-10 table with that line's own machine
 * type ({@link certsForLine}): "excavator with Aramco" lands as TÜV, "crane with Aramco" stays Aramco.
 * The operator cert follows the machine's ({@link operatorCertsFor}) unless the text named one.
 *
 * Only what the AGENT filled is touched, and only here, once, when the parse lands. A cert the renter
 * then picks on a machine card is never re-derived: on the web every machine and operator keeps the
 * renter's own values.
 *
 * A line that inherits the agent's request-wide pick (`project.certificates.safety`, set when every
 * line read the same certs) gets its own filtered copy, because the filter depends on the machine.
 */
export function withAgentCertRule(draft: AgentDraft, taxonomy: Taxonomy): AgentDraft {
  const shared = draft.project.certificates.safety;
  const sharedOther = draft.project.certificates.safetyOther;
  const items = draft.items.map((item) => {
    const picks = item.safetyCertsOverride ?? shared;
    if (!picks.length) return item;
    const lifting = isLiftingCategory(item.ref, taxonomy, {
      en: [item.agentNames?.category, item.agentNames?.subtype].filter(Boolean).join(" "),
      ar: [item.agentNames?.categoryAr, item.agentNames?.subtypeAr].filter(Boolean).join(" "),
    });
    const equipment = certsForLine(picks, lifting);
    const operatorNamed = item.operator.certificate.length > 0 || !!item.operator.certificateOther?.trim();
    return {
      ...item,
      safetyCertsOverride: equipment,
      // An inherited free-text "Other" moves with the list it belonged to.
      safetyCertsOtherText: item.safetyCertsOtherText ?? (item.safetyCertsOverride ? null : sharedOther || null),
      operator:
        item.operatorNeeded === "yes" && !operatorNamed
          ? { ...item.operator, certificate: operatorCertsFor(equipment) }
          : item.operator,
    };
  });
  return { ...draft, items };
}
