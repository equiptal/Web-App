"use client";

/**
 * *The operator* (MREQ-AC-25–28), at the prototype's geometry.
 *
 * A fixed 380px rail beside the machine card rather than a section below it, because the operator is
 * a property of the machine next to it, not a later step. Closed, it collapses to a 72px vertical
 * strip that still says what it is and reopens on a click; it does not disappear, since a renter who
 * closed it by accident needs to find it.
 *
 * ── OPENING IS NOT ANSWERING (owner, 2026-09-01) ─────────────────────────────────────────────────
 *
 * *"Clicking the operator panel toggles it and assumes it is included. I want clicking to open it —
 * but make the renter include it explicitly."*
 *
 * One control was doing two jobs: the header toggle both showed the panel and wrote
 * `operatorNeeded`, and the collapsed strip set it to «yes» on the press that opened it. So a renter
 * who opened the rail to see what was in it had, by that press alone, ordered an operator — and
 * suppliers price one.
 *
 * They are two things now. `expanded` is local and means "the panel is showing"; `operatorNeeded` is
 * the ANSWER, and the only thing that writes it is the question at the top of the panel. Opening
 * changes nothing about the request.
 *
 * The panel opens on whatever the item already says, so an agent that read "with an operator" opens
 * ready to be checked rather than closed and easy to miss.
 *
 * Inside: three boxes at 16px apart, each a `1fr 1fr` grid, matching the machine card's boxes so the
 * two columns read as one row rather than two unrelated cards.
 *
 * Nothing here blocks. Food, accommodation, nationality and the night shift are all optional in the
 * app, so they carry no dots (MREQ-AC-11) — but every value we or the agent chose still carries its
 * provenance note, which is what keeps "supplier covers food" from looking like the renter's own
 * decision when the bids come back priced against it.
 */

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon, TextInput, Toggle } from "@/components/ui";
import { CanvasField, ChoiceChips, ChoiceRow, PanelDot } from "@/components/create/Provenance";
import { useProvenance } from "@/components/create/hooks";
import { OPERATOR_CERTIFICATES, type EquipmentItem, type OperatorCertificate, type Party } from "@/lib/contract";
import { pin } from "@/lib/uiPins";

export function OperatorRail({ item }: { item: EquipmentItem }) {
  const t = useT();
  const { actions } = useRfq();
  const prov = useProvenance(item.id);
  const [moreOpen, setMoreOpen] = useState(false);

  const op = item.operator;
  /** The ANSWER. Nothing but the question below writes it. */
  const on = item.operatorNeeded === "yes";
  /** Whether the panel is showing. Opens on the item's own answer, then the renter's to keep. */
  const [expanded, setExpanded] = useState(on);
  const complete = !on || [op.fatFood, op.fatAccommodationTransport, op.nationality].every(Boolean);

  const setOp = (field: string, patch: Parameters<typeof actions.patchItemOperator>[1]) => {
    prov.touch(`operator.${field}`);
    actions.patchItemOperator(item.id, patch);
  };

  const partyOptions: { value: Party; label: string }[] = [
    { value: "supplier", label: t.options.party.supplier },
    { value: "me", label: t.options.party.me },
  ];

  // ---- Closed: the prototype's 72px strip. Pressing it OPENS, and writes nothing. ----
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-[72px] flex-none flex-col items-center gap-3.5 self-stretch rounded-lg border-[1.5px] border-brand-light bg-brand-soft py-4 transition"
        aria-label={t.create.operator}
      >
        <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-brand text-white">
          <Icon name="person" size={18} />
        </span>
        <span className="text-meta font-extrabold tracking-[0.12em] text-brand-press" style={{ writingMode: "vertical-rl" }}>
          {t.create.operatorRail}
        </span>
        <span className="mt-auto text-subhead font-extrabold leading-none text-brand">+</span>
      </button>
    );
  }

  return (
    <div {...pin("operator-rail")} className="flex w-full flex-none flex-col gap-4 self-stretch rounded-sm border border-border bg-surface p-3.5 lg:min-h-[530px] lg:w-[380px]">
      <div {...pin("operator-rail-head")} className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <PanelDot complete={complete} />
          <h2 className="text-subhead font-extrabold text-navy">{t.create.operator}</h2>
        </span>
        {/* Closes the panel WITHOUT answering. ~~A toggle that wrote «no operator».~~ The answer is
            asked once, below, and a second control for it here is how the two got confused in the
            first place. Since 2026-09-02 switching that answer off also closes — but the two are
            different acts, and this is the one that leaves the answer alone. */}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label={t.common.close}
          title={t.common.close}
          className="grid h-7 w-7 flex-none place-items-center rounded-sm text-muted transition hover:bg-surface2 hover:text-navy"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* ── The question, directly under the title (owner, 2026-09-01) ────────────────────────────
          Asked outright, and answered by the renter — never by the act of opening the panel. It is
          the first thing in the rail because everything under it is a detail OF the answer: with no
          operator there is no food, no accommodation and no certificate to ask about, so the rest is
          hidden until the answer is yes. */}
      {/* ── A switch, not two buttons (owner, 2026-09-02) ────────────────────────────────────────
          A pair of buttons is the shape for a choice between two THINGS. This is one thing that is
          either on or off, and the app's `Toggle` already draws that: brand orange when it is on,
          which is the light the rail's own header and closed strip are painted in.

          Turning it OFF closes the panel, which is the second way out the owner asked for. It is not
          an extra behaviour bolted to the answer: with no operator there is nothing under this line
          to ask about, so the panel has nothing left to show. The ✕ stays for a renter who wants to
          put the rail away WITHOUT changing his answer, which is a different act.

          Turning it on never closes anything, so the switch cannot trap him: the question is still
          right there, and the details it governs appear beneath it. */}
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface2 p-3.5">
        <span className="min-w-0 text-body font-semibold text-navy">{t.create.operatorCard.needOperator}</span>
        <Toggle
          checked={on}
          onChange={(next) => {
            prov.touch("operator_needed");
            actions.patchItem(item.id, { operatorNeeded: next ? "yes" : "no" });
            if (!next) setExpanded(false);
          }}
          label={
            <span className="text-meta font-semibold text-muted">
              {on ? t.create.operatorCard.operatorIncluded : t.create.operatorCard.operatorNotIncluded}
            </span>
          }
        />
      </div>

      {/* Everything below answers "which operator", which only exists once the answer above is yes. */}
      {on && (
      <>

      <div {...pin("operator-rail-options")} className="grid gap-3.5 rounded-sm bg-surface2 p-3.5 sm:grid-cols-2">
        <CanvasField label={t.create.operatorCard.food} source={prov.itemSource("operator.fat_food", op.fatFood)}>
          <ChoiceRow<Party> value={op.fatFood} onChange={(v) => setOp("fat_food", { fatFood: v })} options={partyOptions} />
        </CanvasField>
        {/* One control writes both halves — the app models accommodation and transport as a single
            renter-facing choice, and splitting them here would produce a term pair nobody chose. */}
        <CanvasField
          label={t.create.operatorCard.accommodation}
          source={prov.itemSource("operator.fat_accommodation", op.fatAccommodationTransport)}
        >
          <ChoiceRow<Party>
            value={op.fatAccommodationTransport}
            onChange={(v) => setOp("fat_accommodation", { fatAccommodationTransport: v })}
            options={partyOptions}
          />
        </CanvasField>
      </div>

      <div {...pin("operator-rail-note")} className="rounded-sm bg-surface2 p-3.5">
        <CanvasField
          label={t.create.operatorCard.certificates}
          optional
          source={prov.itemSource("operator.certificate", op.certificate)}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none" aria-hidden>
              <circle cx="12" cy="8" r="5" />
              <path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5" />
            </svg>
          }
        >
          <ChoiceChips<OperatorCertificate>
            values={op.certificate}
            onToggle={(v) =>
              setOp("certificate", {
                certificate: op.certificate.includes(v) ? op.certificate.filter((c) => c !== v) : [...op.certificate, v],
              })
            }
            options={OPERATOR_CERTIFICATES.map((c) => ({ value: c, label: t.create.operatorCard.certShort[c] ?? t.options.safetyCert[c] }))}
          />
        </CanvasField>
        {op.certificate.includes("other") && (
          <TextInput
            value={op.certificateOther ?? ""}
            placeholder={t.create.machineCard.certOther}
            onChange={(e) => actions.patchItemOperator(item.id, { certificateOther: e.target.value })}
            className="mt-2"
          />
        )}
      </div>

      <div className="overflow-hidden rounded-sm bg-surface2">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3.5 py-3 text-start"
          aria-expanded={moreOpen}
        >
          <span className="text-label font-semibold uppercase tracking-[0.05em] text-muted">{t.create.operatorCard.moreDetails}</span>
          <Icon name={moreOpen ? "expand_less" : "expand_more"} size={16} className="text-muted" />
        </button>
        {moreOpen && (
          <div className="grid gap-3.5 px-3.5 pb-3.5 sm:grid-cols-2">
            <CanvasField label={t.create.operatorCard.nationality} source={prov.itemSource("operator.nationality", op.nationality)}>
              <ChoiceRow<string>
                value={op.nationality}
                onChange={(v) => setOp("nationality", { nationality: v, ...(v === "any" ? { nationalityCustom: null } : {}) })}
                options={[
                  { value: "any", label: t.create.operatorCard.nationalityAny },
                  { value: "restricted", label: t.create.operatorCard.nationalityRestricted },
                ]}
              />
            </CanvasField>
            <CanvasField
              label={t.create.operatorCard.nightShift}
              source={prov.itemSource("operator.night_shift", op.nightShift, undefined, true)}
            >
              <span className="flex h-[38px] items-center gap-2.5">
                <Toggle checked={op.nightShift} onChange={(v) => setOp("night_shift", { nightShift: v })} />
                <span className="text-meta text-muted">
                  {op.nightShift ? t.create.operatorCard.nightIncluded : t.create.operatorCard.nightDayOnly}
                </span>
              </span>
            </CanvasField>
            {/* Only meaningful under "Restricted" — and cleared when leaving it, so a stale list can't
                ride along invisibly on a request that now accepts any nationality. */}
            {op.nationality === "restricted" && (
              <div className="sm:col-span-2">
                <TextInput
                  value={op.nationalityCustom ?? ""}
                  maxLength={100}
                  placeholder={t.create.operatorCard.nationalityCustom}
                  onChange={(e) => actions.patchItemOperator(item.id, { nationalityCustom: e.target.value })}
                />
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
