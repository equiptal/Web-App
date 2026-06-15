"use client";

import { useEffect, useMemo, useState } from "react";
import { useT, fmt } from "@/lib/i18n";
import { useRfq, agentMatches } from "@/lib/store/rfq-store";
import { Card, Field, Icon, MIcon, RadioGroup, SelChips, TextInput } from "@/components/ui";
import {
  gateStep2,
  isCompleteRef,
  PARTIES,
  SAFETY_CERTIFICATES,
  OTHER_CERTIFICATES,
  type EquipmentItem,
  type Party,
  type SafetyCertificate,
  type OtherCertificate,
} from "@/lib/contract";
import { ItemRow } from "@/components/wizard/ItemRow";

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}
function opt<T extends string>(values: readonly T[], dict: Record<string, string>) {
  return values.map((v) => ({ value: v, label: dict[v] ?? v }));
}

type Group = "all" | "needs-ok" | "matched" | "not-available";

function groupOf(i: EquipmentItem): Exclude<Group, "all"> {
  if (i.verdict === "no-match") return "not-available";
  if (i.resolved) return "matched";
  return "needs-ok";
}

export function Step2Equipment() {
  const t = useT();
  const { state, actions } = useRfq();
  const { draft, taxonomy } = state;

  const items = useMemo(() => (draft ? draft.items.filter((i) => !i.removed) : []), [draft]);
  const counts = useMemo(() => {
    const c = { all: items.length, "needs-ok": 0, matched: 0, "not-available": 0 };
    items.forEach((i) => (c[groupOf(i)] += 1));
    return c;
  }, [items]);

  // Default to a single group (never "all" together) — lead with whatever needs attention,
  // matching the prototype's "Needs your OK" default. The renter switches via the nodes.
  const initialFilter = useMemo<Group>(() => {
    if (counts["needs-ok"]) return "needs-ok";
    if (counts.matched) return "matched";
    if (counts["not-available"]) return "not-available";
    return "all";
  }, [counts]);
  const [filter, setFilter] = useState<Group | null>(null);

  // After the renter clears Need-OK (approves all), surface Matched next — not Not-available.
  useEffect(() => {
    if ((filter ?? initialFilter) === "needs-ok" && counts["needs-ok"] === 0 && counts.matched > 0) setFilter("matched");
  }, [filter, initialFilter, counts]);

  if (!draft) return null;

  const activeFilter: Group = filter ?? initialFilter;
  const project = draft.project;
  const ap = state.agentOrigin?.project; // agent's original request-wide values, for the AI marker
  const gate = gateStep2(draft.items);
  const visible = items.filter((i) => activeFilter === "all" || groupOf(i) === activeFilter);
  // Auto-open the per-item settings on the first matched item (teaching cue) — the rest stay collapsed.
  const firstMatchedId = visible.find((i) => groupOf(i) === "matched")?.id;
  const activeNode = { "needs-ok": t.step2.filterNeedsOk, matched: t.step2.filterMatched, "not-available": t.step2.filterNotAvailable, all: t.step2.filterAll }[activeFilter];

  // In-process "back" through the triage groups (separate from the wizard's Back-to-Project).
  const seq: Exclude<Group, "all">[] = ["needs-ok", "matched", "not-available"];
  const seqIdx = seq.indexOf(activeFilter as Exclude<Group, "all">);
  const prevGroup = seqIdx > 0 ? [...seq.slice(0, seqIdx)].reverse().find((g) => counts[g] > 0) : undefined;

  // Approve all: only resolve items that end up with a complete taxonomy ref — either they carry a
  // nearest-size suggestion (approveSuggestion fills the measurement) or their ref is already
  // complete. Items still missing a size (no suggestion) are LEFT in Needs-your-OK so the renter must
  // pick a size — they can't be bulk-approved without one.
  function approveAll() {
    items
      .filter((i) => groupOf(i) === "needs-ok")
      .forEach((i) => {
        if (i.suggestion) actions.approveSuggestion(i.id);
        else if (isCompleteRef(i.ref)) actions.approveItem(i.id);
        // else: missing size, no suggestion → skip (stays in Needs your OK).
      });
  }

  const partyOpts = PARTIES.map((p) => ({ value: p, label: t.options.party[p] }));

  const nodes: { key: Group; label: string; count: number; color: string; glyph: string }[] = [
    { key: "needs-ok", label: t.step2.filterNeedsOk, count: counts["needs-ok"], color: "warn", glyph: "hourglass_top" },
    { key: "matched", label: t.step2.filterMatched, count: counts.matched, color: "ok", glyph: "task_alt" },
    { key: "not-available", label: t.step2.filterNotAvailable, count: counts["not-available"], color: "danger", glyph: "block" },
    { key: "all", label: t.step2.filterAll, count: counts.all, color: "navy", glyph: "apps" },
  ];

  return (
    <div>
      <div className="mb-5 flex items-start gap-3">
        {prevGroup && (
          <button
            onClick={() => setFilter(prevGroup)}
            title={t.common.back}
            className="mt-1 grid h-9 w-9 flex-none place-items-center rounded-full border border-border text-navy-mid transition hover:bg-surface2"
          >
            <Icon name="arrow_back" size={20} className="rtl:scale-x-[-1]" />
          </button>
        )}
        <div>
          <h1 className="text-[23px] font-extrabold tracking-tight">{t.step2.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">{t.step2.subtitle}</p>
        </div>
      </div>

      {/* Unified request-wide settings (AC-25/26/50) — Logistics + Certificates that apply to EVERY
          item, each per-item overridable. One panel so the "applies to all" model is clear. */}
      <Card
        title={<><Icon name="tune" size={18} className="me-1.5 align-[-3px] text-navy-mid" />{t.step2.settingsForAll}</>}
        aside={
          <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-bold text-info">
            <Icon name="layers" size={13} /> {fmt(t.step2.appliesToItems, { count: items.length })}
          </span>
        }
      >
        <p className="-mt-2 mb-4 text-[12.5px] text-muted">{t.step2.settingsForAllHint}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t.step1.requestWide.delivery} agent={agentMatches(project.deliveryToSite, ap?.deliveryToSite)}>
            <RadioGroup<Party> name="delivery" value={project.deliveryToSite} onChange={(v) => actions.patchRequestWide({ deliveryToSite: v })} options={partyOpts} />
          </Field>
          <Field label={t.step1.requestWide.return} agent={agentMatches(project.returnFromSite, ap?.returnFromSite)}>
            <RadioGroup<Party> name="return" value={project.returnFromSite} onChange={(v) => actions.patchRequestWide({ returnFromSite: v })} options={partyOpts} />
          </Field>
          <Field label={t.step1.requestWide.fuelResponsibility} agent={agentMatches(project.fuelResponsibility, ap?.fuelResponsibility)}>
            <RadioGroup<Party> name="fuelResp" value={project.fuelResponsibility} onChange={(v) => actions.patchRequestWide({ fuelResponsibility: v })} options={partyOpts} />
          </Field>
        </div>

        {/* Certificates — moved here from the Project step so all request-wide settings are unified. */}
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wide text-muted">{t.step2.certificatesTitle}</div>
          <Field label={t.step1.certificates.safety} optional agent={agentMatches(project.certificates.safety, ap?.certificates.safety)}>
            <SelChips<SafetyCertificate>
              values={project.certificates.safety}
              onToggle={(v) => actions.setCertificates({ safety: toggle(project.certificates.safety, v) })}
              options={opt(SAFETY_CERTIFICATES, t.options.safetyCert)}
            />
            {project.certificates.safety.includes("other") && (
              <div className="mt-2">
                <TextInput
                  placeholder={t.step1.certificates.otherSafetyPlaceholder}
                  value={project.certificates.safetyOther}
                  onChange={(e) => actions.setCertificates({ safetyOther: e.target.value })}
                />
              </div>
            )}
          </Field>
          <div className="mt-4">
            <Field label={t.step1.certificates.other} optional agent={agentMatches(project.certificates.other, ap?.certificates.other)}>
              <SelChips<OtherCertificate>
                values={project.certificates.other}
                onToggle={(v) => actions.setCertificates({ other: toggle(project.certificates.other, v) })}
                options={opt(OTHER_CERTIFICATES, t.options.otherCert)}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Triage filter nodes with counts. */}
      <div className="my-5 flex items-start gap-1 px-2">
        {nodes.map((n, idx) => {
          const sel = activeFilter === n.key;
          const tone: Record<string, string> = {
            warn: sel ? "bg-warn text-white" : "bg-warn-soft text-warn",
            ok: sel ? "bg-ok text-white" : "bg-ok-soft text-ok",
            danger: sel ? "bg-danger text-white" : "bg-danger-soft text-danger",
            navy: sel ? "bg-navy text-white" : "bg-surface2 text-navy-mid",
          };
          return (
            <div key={n.key} className="flex flex-1 items-start">
              <button onClick={() => setFilter(n.key)} className="flex flex-1 flex-col items-center gap-2.5">
                <span className={`grid h-[52px] w-[52px] place-items-center rounded-full border border-border transition ${tone[n.color]} ${sel ? "shadow-md" : ""}`}>
                  <MIcon name={n.glyph} size={26} />
                </span>
                <span className={`text-[12.5px] font-bold ${sel ? "text-navy" : "text-muted"}`}>
                  {n.label} <b className="text-navy">{n.count}</b>
                </span>
              </button>
              {idx < nodes.length - 1 && <span className="mx-2 mt-[25px] h-[3px] flex-1 rounded bg-surface3" />}
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-info/20 bg-info-soft px-3.5 py-2.5 text-xs text-navy-mid">
        <Icon name="lightbulb" size={17} className="flex-none text-info" />
        <span>{t.step2.triageTip}</span>
      </div>

      {!gate.ok && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{t.step2.blockedNote}</p>}

      {/* Group header — shows the active group + count, with "Approve all" on the Needs-your-OK group. */}
      <div className="mb-3 mt-1 flex items-center justify-between px-1">
        <span className="text-[13px] font-bold text-navy">
          {activeNode} <span className="text-muted">({visible.length})</span>
        </span>
        {activeFilter === "needs-ok" && visible.length > 0 && (
          <button className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-brand" onClick={approveAll}>
            <Icon name="done_all" size={16} /> {t.step2.approveAll}
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {visible.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t.step2.groupEmpty}</li>
        ) : (
          visible.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              taxonomy={taxonomy}
              sharedFuelResp={project.fuelResponsibility}
              sharedDelivery={project.deliveryToSite}
              sharedReturn={project.returnFromSite}
              defaultOpen={item.id === firstMatchedId}
            />
          ))
        )}
      </ul>

      <button
        className="mt-2 inline-flex items-center gap-2 py-2.5 text-sm font-bold text-navy-mid"
        onClick={() => {
          actions.addItem();
          setFilter("needs-ok"); // new item starts in Need-OK with its picker open — jump there so it's visible
        }}
      >
        <Icon name="add" size={18} className="text-brand" /> {t.step2.addItem}
      </button>
    </div>
  );
}
