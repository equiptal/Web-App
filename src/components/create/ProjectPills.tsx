"use client";

/**
 * The pills — what the site is filling in, and how to change any of it (W-T8 · spec §11.1, §11.2).
 *
 * Replaces the chip row once a site is picked, in the same strip inside the intake card, so nothing
 * jumps when you choose one.
 *
 * ── The strip sits UNDER the box, in the row the examples had ─────────────────────────────────────
 *
 * ~~On the floor of the compose field, inside the card.~~ Moved out on 2026-08-31 (owner: *"projects
 * will be in the place of these suggestions"*) — the example-sentence chips are gone and the sites
 * have their row. Inside the card the values read as furniture; on the page they read as what they
 * are, things to pick from and edit. The values were never IN the textarea and still are not: that
 * is a native control holding the renter's own words, and keeping it to those words is what keeps
 * the agent's input small.
 *
 * ── Every value is a control, and looks like one ─────────────────────────────────────────────────
 *
 * Basis, start, end, extendable and payment terms are each an editable pill with a caret or a date
 * field, not text with an edit hidden behind a hover. A read-only summary sitting where the renter
 * expects to be able to answer sends them hunting for the screen that owns it — so the pill IS the
 * screen that owns it. The site pill is the one exception: changing where the work happens means
 * choosing a different project, not typing over a label.
 *
 * ── Every edit here is REQUEST-LOCAL ─────────────────────────────────────────────────────────────
 *
 * Change the basis to weekly and Qiddiya still says monthly. The pills edit a copy the intake screen
 * holds, and the project is never written from this surface (PROJ-AC-25). Editing the site itself is
 * a separate, deliberate act on the project page, which then asks whether the change should reach
 * anything already filed under it.
 *
 * A changed pill is **marked**, and the field it covers reads `renter` rather than `project` on the
 * canvas afterwards: once someone has answered a question it stops being the site's answer.
 *
 * ── Conflict ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The agent already returns `detected_locations`. The comparison against the site happens **here, in
 * the browser** — string comparison, no model. The site pill turns red and offers both. Keeping what
 * was written is a valid answer: the request sits in the project with a different site, and they
 * simply disagree. That is the point of the independence rule, not a state to resolve away.
 */

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { shortSite } from "@/lib/contract/project";
import {
  RENTAL_BASES,
  PAYMENT_TERMS,
  SAFETY_CERTIFICATES,
  type RentalBasis,
  type PaymentTerm,
  type Party,
  type SafetyCertificate,
} from "@/lib/contract/options";
import { Icon } from "@/components/ui";
import { Dropdown } from "@/components/Dropdown";

/** «No certificate», as a value — the same sentinel `MachineCard` uses, because `[]` cannot say it. */
const NO_CERT = "__none__";

/* ----------------------------- One pill ----------------------------- */

/**
 * Four tones, and the same four wherever a pill appears in the strip.
 *
 * `missing` is the one added on 2026-09-01: a term the request CANNOT go out without and nobody has
 * answered. Red and empty rather than absent, because an absent pill is a question the renter never
 * sees — and the three it applies to (who delivers, who returns it, who pays for the fuel) are the
 * three every supplier has to ask about before he can price anything.
 */
function tone(changed?: boolean, conflict?: boolean, missing?: boolean) {
  return conflict || missing
    ? "border-danger bg-danger/5 text-danger"
    : changed
      ? "border-brand bg-brand-soft text-navy"
      : "border-border bg-surface text-navy";
}

/**
 * The × that drops a pill off the strip.
 *
 * Only on what the request can go out without (owner, 2026-09-01). A required term has none: an ×
 * that hands back a red box the moment it is pressed is a control that argues with the renter, and
 * the honest answer to "I do not want to state this" there is that the request needs it.
 */
function PillX({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`${label} ×`}
      className="-me-1 grid h-4 w-4 flex-none place-items-center rounded-full text-current/55 transition hover:bg-surface2 hover:text-current"
    >
      <Icon name="close" size={11} />
    </button>
  );
}

/**
 * ONE geometry for every pill in the strip (owner, 2026-08-31: *"make these nicer"*).
 *
 * They were `py-1` on their own content, so a pill holding a date input stood a pixel or two taller
 * than one holding text and the row read as hand-set. A fixed `h-8` and one radius is what makes a
 * wrapping row of eight controls look like one instrument rather than eight chips that happen to be
 * adjacent — and `h-8` is the app's own small-control height, not a number chosen here.
 */
/**
 * BOXED, not pill-shaped (owner, 2026-08-31: *"chips can be less rounded, like boxed, so these
 * toggles fit inside"*).
 *
 * A capsule fights a square control: a segmented toggle inside a fully rounded chip leaves two
 * crescents of dead space and reads as a badge with something stuck to it. `rounded-sm` is the same
 * radius every field in the two dialogs uses, so a value you can change looks like a value you can
 * change wherever you meet it.
 */
const PILL = "inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-label";
const EDITABLE = "transition hover:border-brand focus-within:border-brand";
const LABEL = "font-semibold uppercase tracking-[.03em] opacity-55";
const VALUE = "font-semibold tabular-nums";

/** A pill that only reports. The site, and nothing else. */
function Pill({
  label,
  value,
  changed,
  conflict,
  onRemove,
}: {
  label: string;
  value: ReactNode;
  changed?: boolean;
  conflict?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span className={`${PILL} ${tone(changed, conflict)}`}>
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{value}</span>
      {changed && !conflict && <span aria-hidden className="text-meta leading-none text-brand">●</span>}
      {onRemove && <PillX label={label} onRemove={onRemove} />}
    </span>
  );
}

/**
 * A pill that is a dropdown.
 *
 * The native `select` covers the whole pill at zero opacity, so the whole thing is the hit target
 * and the menu opens where the platform puts it — a custom menu here would be a second listbox to
 * keyboard-support for the sake of matching a border radius. The caret is what says so before the
 * renter clicks: without it this is text that happens to react.
 */
function PillSelect<T extends string>({
  label,
  value,
  options,
  optionLabel,
  empty = "—",
  changed,
  missing,
  onRemove,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  optionLabel?: (v: T) => string;
  empty?: string;
  changed?: boolean;
  missing?: boolean;
  onRemove?: () => void;
  onChange: (v: T | null) => void;
}) {
  return (
    /* ── ONE box, not a box in a box (owner, 2026-09-01: *"why are some boxes nested? remove the
       nested, keep it one box"*) ────────────────────────────────────────────────────────────────
       The pill was a bordered `span` wrapping a `Dropdown` whose `pill` tone draws its own border,
       so BASIS and PAYMENT rendered as two rectangles a pixel apart while START, END and EXTENDABLE
       — which are not dropdowns — rendered as one. The trigger IS the pill: it takes the pill's own
       skin through `triggerClass`, and the wrapper is gone.

       ~~A native `select` at zero opacity stretched over the pill.~~ Before that, and worse: it
       opened the operating system's menu, with a blue highlight bar and no way to tick the chosen
       row. */
    <span className="inline-flex items-center">
    <Dropdown
      triggerClass={`${PILL} ${tone(changed, false, missing)} ${EDITABLE}`}
      label={label}
      prefix={label}
      placeholder={empty}
      value={value}
      onChange={(v) => onChange((v || null) as T | null)}
      options={options.map((o) => ({ value: o, label: optionLabel ? optionLabel(o) : o }))}
    />
    {/* Outside the trigger: inside it, a press on the × would open the menu on its way past. */}
    {onRemove && (
      <span className={`${PILL} ${tone(changed, false, missing)} -ms-px rounded-s-none border-s-0 ps-0`}>
        <PillX label={label} onRemove={onRemove} />
      </span>
    )}
    </span>
  );
}

/**
 * A pill whose value is one of two, both shown.
 *
 * *Delivery: Supplier ▾* makes a renter open a menu to learn that the other option is *Me*. With two
 * options there is nothing to reveal — showing both and filling the chosen one turns a question into
 * a glance, and answering it is one press instead of three.
 *
 * Radio inputs rather than buttons, so a keyboard lands on the group once and the arrow keys move
 * inside it, and a screen reader is told these are two answers to one question.
 */
function PillSegment<T extends string>({
  label,
  value,
  options,
  optionLabel,
  changed,
  missing,
  onRemove,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly [T, T];
  optionLabel: (v: T) => string;
  changed?: boolean;
  missing?: boolean;
  onRemove?: () => void;
  onChange: (v: T) => void;
}) {
  const name = `${label}-${options.join("-")}`;
  return (
    <span className={`${PILL} ${tone(changed, false, missing)} pe-0.5`}>
      <span className={LABEL}>{label}</span>
      {changed && <span aria-hidden className="text-meta leading-none text-brand">●</span>}

      <span role="radiogroup" aria-label={label} className="ms-0.5 inline-flex overflow-hidden rounded-sm border border-border">
        {options.map((o) => {
          const on = value === o;
          return (
            <label
              key={o}
              className={`cursor-pointer px-2 py-0.5 text-label font-semibold transition ${
                on ? "bg-brand text-brand-fg" : "bg-surface text-muted hover:text-navy"
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={on}
                onChange={() => onChange(o)}
                /* Off-screen rather than `hidden`: a hidden input is not focusable, and this is the
                   thing the keyboard has to land on. */
                className="absolute h-0 w-0 opacity-0"
              />
              {optionLabel(o)}
            </label>
          );
        })}
      </span>
      {onRemove && <PillX label={label} onRemove={onRemove} />}
    </span>
  );
}

/**
 * A pill that is a date.
 *
 * The native date input sits IN the pill rather than under it: a date is typed or picked, so an
 * overlay would have to reproduce a calendar. Its own picker glyph is the affordance, which is why
 * this one carries no caret.
 */
function PillDate({
  label,
  value,
  changed,
  onChange,
}: {
  label: string;
  value: string | null;
  changed?: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className={`${PILL} ${EDITABLE} ${tone(changed)}`}>
      <span className={LABEL}>{label}</span>
      {/* The native control, stripped to its text and its picker glyph. `focus-visible:outline-none`
          because the pill itself takes the focus ring now (see `EDITABLE`) — the global 2px brand
          outline drawn around an input inside a bordered pill was two rings, one inside the other. */}
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={label}
        className={`w-[104px] cursor-pointer bg-transparent text-inherit outline-none focus-visible:outline-none ${VALUE}`}
      />
      {changed && <span aria-hidden className="text-meta leading-none text-brand">●</span>}
    </label>
  );
}

/* ----------------------------- The strip ----------------------------- */

export function ProjectPills() {
  const t = useT();
  const { state, actions } = useRfq();
  /* ~~The template list, its fetch and `applyTemplate`.~~ All three moved to `ProjectChips` with
     the control that used them (owner, 2026-08-31) — the dropdown belongs to the row that picks the
     site. What a template LEAVES behind is still read here: see `terms` below. */
  const project = state.project;
  if (!project) return null;

  const { timing } = project.defaults;
  /* The terms a template put on this request, if one did. Read from the store rather than held here:
     they are part of the draft the renter is about to send, not a detail of this strip. */
  const terms = state.templateTerms;
  const dirty = (key: string) => state.projectDirty.includes(key);

  /**
   * The site the agent read out of the renter's own words, when it read one that is not this site's.
   *
   * Only meaningful once the agent has run — before that there is nothing to disagree with. Plain
   * case-insensitive comparison of the leading segment: the site label carries a postcode and a city
   * the renter would never type, so comparing the whole string would report a conflict on every
   * request (spec §11.2).
   */
  const spoken = state.draft?.detectedLocations?.[0] ?? null;
  const conflict =
    spoken && shortSite(spoken).toLowerCase() !== shortSite(project.location.label).toLowerCase() ? spoken : null;

  return (
    /* INSIDE the box now, above the line you type on (owner, 2026-08-31: *"they will appear on the
       text area"*). It sat under the card for a day on the reading that a strip of the renter's own
       values reads better standing on the page. The owner's point is stronger: these values ARE the
       request, so they belong in the thing the request is written in — and the box is where a renter
       looks to see what they are about to send.

       ~~Its own bottom border.~~ Removed (owner, 2026-08-31: *"I want the focus on select for the
       whole card, not like these — it feels sections"*). A rule under the strip and another over the
       upload row cut the card into three panels, and on focus the card's border went brand while
       those two stayed grey, so the one control looked like three that disagreed. The 20px gutter is
       shared with the textarea below instead, which is what makes them read as one field. */
    <div className="flex flex-col gap-2 px-5 pb-2 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* ~~The project itself, filled navy, carrying the dropdown of its work orders and
            requests.~~ It moved OUT of the card on 2026-08-31 (owner: *"I want the dropdown of work
            order and request of a project to open here in this rounded pill, not in the text
            area"*) — to the `PROJECT` row under the box, where the site is chosen in the first
            place. See `ProjectChips`.

            What is left in here is what belongs here: the request's own VALUES. The site's identity
            and the question "what have I already hired at this site?" are both answered in the row
            that picks the site. */}
        <Pill
          label={t.projects.pills.site}
          value={shortSite(project.location.label)}
          changed={dirty("location.label")}
          conflict={!!conflict}
        />

        {/* ── The period, in the order it is read: on what footing, from when, to when, and whether
            the end is soft. Each one its own pill, because "dates: A → B" was a single value the
            renter could not put a caret into. */}
        <PillSelect<RentalBasis>
          label={t.projects.pills.basis}
          value={timing.rentalBasis}
          options={RENTAL_BASES}
          changed={dirty("timing.rental_basis")}
          onChange={(v) => actions.patchProjectDefaults({ rentalBasis: v }, ["timing.rental_basis"])}
        />

        <PillDate
          label={t.projects.pills.start}
          value={timing.startDate}
          changed={dirty("timing.start_date")}
          onChange={(v) => actions.patchProjectDefaults({ startDate: v }, ["timing.start_date"])}
        />

        <PillDate
          label={t.projects.pills.end}
          value={timing.endDate}
          changed={dirty("timing.end_date")}
          onChange={(v) => actions.patchProjectDefaults({ endDate: v }, ["timing.end_date"])}
        />

        {/* ~~A dropdown, so it carries a label and a value like every pill beside it.~~ Both answers
            shown instead (owner, 2026-08-31). The old reasoning was right about the checkbox — a lone
            tickbox in a row of values reads as an action — and wrong about the remedy: with exactly
            two options there is nothing to reveal, and a menu made the renter open it to learn what
            the other one was. */}
        <PillSegment<"yes" | "no">
          label={t.projects.pills.extendable}
          value={timing.extendable ? "yes" : "no"}
          options={["yes", "no"] as const}
          optionLabel={(v) => (v === "yes" ? t.common.yes : t.common.no)}
          changed={dirty("timing.extendable")}
          onChange={(v) => actions.patchProjectDefaults({ extendable: v === "yes" }, ["timing.extendable"])}
        />

        <PillSelect<PaymentTerm>
          label={t.projects.pills.paymentTerms}
          value={project.defaults.paymentTerms}
          options={PAYMENT_TERMS}
          changed={dirty("preferences.payment_terms")}
          /* Droppable: a request with no stated payment terms is a request the supplier quotes his
             own on, which is a normal way to ask. */
          onRemove={() => actions.patchProjectTerms(null)}
          onChange={(v) => actions.patchProjectTerms(v)}
        />

        {/* ── The machine's own terms, once one has been picked ──────────────────────────

            Who delivers, who returns it, who pays for the fuel, and whether it needs an operator —
            each as a value the renter can change here, on this request, without touching the machine
            it was copied from (PROJ-AC-25).

            Two-answer fields are segments rather than menus: with only *me* and *supplier* there is
            nothing to reveal, and a renter comparing them should not have to open anything. */}
        {/* ── The three a request cannot go out without ────────────────────────────────────────
            Drawn whether or not a template ran (owner, 2026-09-01). They used to appear only when a
            work order or a request had been copied, so a renter who picked a SITE and nothing else
            was never asked who delivers, who returns it, or who pays for the fuel — and every
            supplier bidding had to ask him before he could price anything.

            Unanswered, they are RED and empty. No × on them either: an × that hands back a red box
            the moment it is pressed is a control arguing with the renter, and the honest answer to
            "I do not want to state this" here is that the request needs it. */}
        <PillSegment<Party>
          label={t.projects.pills.delivery}
          value={terms?.deliveryOverride ?? null}
          options={["me", "supplier"] as const}
          optionLabel={(v) => t.options.party[v]}
          changed={dirty("preferences.delivery")}
          missing={!terms?.deliveryOverride}
          onChange={(v) => actions.patchTerms({ deliveryOverride: v }, ["preferences.delivery"])}
        />
        <PillSegment<Party>
          label={t.projects.pills.ret}
          value={terms?.returnOverride ?? null}
          options={["me", "supplier"] as const}
          optionLabel={(v) => t.options.party[v]}
          changed={dirty("preferences.return")}
          missing={!terms?.returnOverride}
          onChange={(v) => actions.patchTerms({ returnOverride: v }, ["preferences.return"])}
        />
        <PillSegment<Party>
          label={t.projects.pills.fuelResp}
          value={terms?.fuelResponsibilityOverride ?? null}
          options={["me", "supplier"] as const}
          optionLabel={(v) => t.options.party[v]}
          changed={dirty("preferences.fuel")}
          missing={!terms?.fuelResponsibilityOverride}
          onChange={(v) => actions.patchTerms({ fuelResponsibilityOverride: v }, ["preferences.fuel"])}
        />

        {terms && (
          <>
            <PillSegment<"yes" | "no">
              label={t.projects.pills.operator}
              value={terms.operatorNeeded === "no" ? "no" : "yes"}
              options={["yes", "no"] as const}
              optionLabel={(v) => (v === "yes" ? t.common.yes : t.common.no)}
              changed={dirty("preferences.operator")}
              /* No × — `operatorNeeded` does not admit "unstated": its two answers are yes and no,
                 and *no* IS the answer a renter who does not want an operator is giving. */
              onChange={(v) => actions.patchTerms({ operatorNeeded: v }, ["preferences.operator"])}
            />

            {/* ── The certificate is EDITABLE, and shown whether or not it is set ──────────────
                ~~Certificates report rather than edit: the set lives in *More details*.~~ Two faults
                in one pill (owner, 2026-08-31: *"this is read only and cant be edited"*).

                It could not be changed — every other term on this row can, so one that only reports
                reads as a bug rather than as a pointer to somewhere else. And it appeared ONLY when
                a certificate was already set, so a renter who wanted to ADD one had nothing to press
                and no reason to think this row was where it lived.

                One choice, not a multi-select: the machine card asks it exactly this way — no
                certificate, TÜV, Aramco, Other — and two shapes for one question is how the two
                surfaces drift. «Other» keeps its free-text box in *More details*, which is the one
                thing a pill genuinely cannot hold. */}
            <PillSelect<string>
              label={t.projects.pills.certs}
              value={terms.safetyCertsOverride?.[0] ?? (terms.safetyCertsOverride ? NO_CERT : null)}
              options={[NO_CERT, ...SAFETY_CERTIFICATES]}
              optionLabel={(v) => (v === NO_CERT ? t.create.machineCard.noCert : t.options.safetyCert[v as SafetyCertificate] ?? v)}
              changed={dirty("preferences.certs")}
              onRemove={() => actions.patchTerms({ safetyCertsOverride: null }, ["preferences.certs"])}
              onChange={(v) =>
                actions.patchTerms(
                  {
                    safetyCertsOverride: (v == null ? null : v === NO_CERT ? [] : [v as SafetyCertificate]),
                  },
                  ["preferences.certs"],
                )
              }
            />
          </>
        )}

      </div>

      {/* The conflict. Both values stay; the renter picks, and keeping theirs is a valid answer. */}
      {conflict && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 text-meta text-navy">
          <Icon name="warning" size={14} className="flex-none text-danger" />
          <span>{t.projects.pills.conflict.replace("{spoken}", shortSite(conflict))}</span>
          <button
            type="button"
            onClick={() => actions.patchProjectSite({ label: conflict, lat: null, lng: null })}
            className="font-semibold text-danger underline underline-offset-2"
          >
            {t.projects.pills.keepMine}
          </button>
          <span className="text-muted">·</span>
          <button
            type="button"
            onClick={() => actions.patchProjectSite(project.location)}
            className="font-semibold text-navy underline underline-offset-2"
          >
            {t.projects.pills.useProject}
          </button>
        </div>
      )}

      {/* ~~Three sentences under the strip: «You type the machine.» + what to type + «every value
          above is this project's, and editing one here changes only this request».~~ All removed
          (owner, 2026-08-31). Two of the three were teaching the strip, and a strip that needs three
          lines of instruction under it is the wrong strip: the pills now carry their own labels, a
          caret each, and the amber dot on anything the renter has changed. The third named what to
          write in a box whose own placeholder types four examples of exactly that. */}
    </div>
  );
}
