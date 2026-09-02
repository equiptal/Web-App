"use client";

/**
 * *Where it goes* (MREQ-AC-04/29/30/31).
 *
 * The prototype drew this panel as static tiles with a hardcoded Riyadh address. The real picker is
 * `GoogleMapLocationPicker`, already used by the step it replaces, and it is what ships here — a
 * mocked map would let a renter "confirm" a site the request does not actually carry coordinates for.
 *
 * Confirmation is explicit and always required, even when the agent extracted the address, and it is
 * invalidated by any subsequent edit (the store's `PATCH_LOCATION` clears `confirmed`). Moving the
 * pin and forgetting to re-confirm is exactly how a machine ends up at last week's site.
 */

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon } from "@/components/ui";
import { PanelDot } from "@/components/create/Provenance";
import { useProvenance } from "@/components/create/hooks";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { isSystemChosen } from "@/lib/contract";
import { leftTheSite } from "@/lib/contract/project";

// Client-only: the maps script touches `window` at import.
const MapLocationPicker = dynamic(() => import("@/components/shared/GoogleMapLocationPicker"), { ssr: false });

export function WherePanel({
  open,
  complete,
  onToggle,
  shakeConfirm,
}: {
  open: boolean;
  complete: boolean;
  onToggle: () => void;
  /** True while a refused move is pointing at the confirm button (MREQ-AC-03). */
  shakeConfirm?: boolean;
}) {
  const t = useT();
  const { state, actions } = useRfq();
  // Above the early return: hooks run in the same order on every render, and `project` being absent
  // is a render this component still performs.
  const prov = useProvenance(null);

  const project = state.draft?.project;
  if (!project) return null;

  const loc = project.location;
  const conflictUnresolved = Boolean(loc.conflict && !loc.conflict.resolvedFrom);
  /* Where the address came from, so the panel can say so (owner, 2026-08-31: *"any value —
     location or dates or anything from project or work order — show the 'from your project' label
     like the AI detected"*).

     `Where` was the one panel with no provenance line at all: it had a completeness dot and nothing
     else, so a location the site supplied looked identical to one the renter typed. */
  const locationSource = prov.projectSource("location.label", loc.label, prov.agentProject?.location?.label);

  /* ── Moved off the site: the one difference that unfiles the request ────────────────────────────
   *
   * Every other value a site supplies is a default a request may differ on, and the chart shows the
   * difference. A site IS a place, so this one is not a difference — it is a request that belongs to
   * no site. It used to be settled silently at submit (owner, 2026-08-31: *"it is silently dropped
   * from the project"*); now it is stated where the renter is doing the moving, and again beside the
   * send button, before anything is decided for them. */
  const unfiled = state.project ? leftTheSite(state.project.location, loc) : false;

  // AC-16 — a typed label is not a location. Confirming requires an actual point on the map.
  const hasLocation = loc.lat != null && loc.lng != null;
  const multi = (state.draft?.detectedLocations ?? []).filter(Boolean);

  /**
   * Confirming the site, as one control rendered in one of two places.
   *
   * With a pin down it rides the address line inside the picker; with no pin there is no address line
   * to ride, so it falls to the row below beside the hint that says what to do. Building it once
   * keeps those two places from drifting into two different buttons.
   */
  /* `hasLocation` as well as the flag: a `confirmed` with no point on the map is a state `gateWhere`
     refuses outright, so a badge claiming it would be a green light on a dead end. Belt and braces —
     the prefill no longer creates that state (see `applyProjectDefaults`), but this panel is the one
     surface that must never say "confirmed" about a site the request cannot carry. */
  const confirmControl = loc.confirmed && hasLocation ? (
    <span className="flex flex-none items-center gap-1.5 rounded-sm border border-ok/30 bg-ok-soft px-3 py-2 text-body font-semibold text-ok">
      <Icon name="check_circle" size={17} /> {t.step1.location.confirmed}
    </span>
  ) : (
    <button
      type="button"
      disabled={!hasLocation}
      onClick={() => actions.confirmLocation()}
      className={`flex-none rounded-sm bg-navy px-4 py-2 text-body font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg ${
        shakeConfirm ? "shake-error" : ""
      }`}
    >
      {t.create.wherePanel.confirm}
    </button>
  );

  return (
    <section {...pin("where-panel")}
      className={`mb-3.5 rounded-sm border transition ${complete && !open ? "border-ok/40 bg-ok/[0.06]" : "border-border bg-surface"}`}
    >
      <button {...pin("where-panel-head")}
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <PanelDot complete={complete} />
          <Icon name="place" size={16} className="flex-none text-navy" />
          <span className="flex-none text-subhead font-extrabold text-navy">{t.create.where}</span>
          {/* The amber ring, where the «from your project» line used to be.
 
              The label is gone product-wide (owner, 2026-09-01: *"remove ai/project label, the orange
              highlight is enough"*) — but `Where` was the one panel that had ONLY the label and no
              ring, so dropping it would have made a site-supplied address look identical to a typed
              one. That is the exact thing the 2026-08-31 ask fixed. Same signal, in the product's
              own vocabulary. */}
          <span
            className={
              isSystemChosen(locationSource) && !unfiled
                ? "truncate rounded-sm bg-warn/[0.07] px-1.5 text-body text-muted ring-1 ring-warn/45"
                : "truncate text-body text-muted"
            }
          >
            {loc.label ?? "—"}
            {hasLocation && <span className="ms-1.5 text-muted/70">{`${loc.lat?.toFixed(6)}, ${loc.lng?.toFixed(6)}`}</span>}
          </span>
          {/* The site's mark is replaced by the consequence, not accompanied by it: a «from your
              project» ring around «this is no longer your project's place» would be two claims in a
              row contradicting each other. */}
          {unfiled ? (
            <span className="flex flex-none items-center gap-1 text-meta font-semibold text-danger">
              <Icon name="error_outline" size={13} /> {t.create.wherePanel.unfiledShort}
            </span>
          ) : null}
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} className="flex-none text-muted" />
      </button>

      {open && (
        <div {...pin("where-panel-body")} className="px-5 pb-5">
          {/* ~~The same thing again, in full, in a red band across the panel.~~ Removed (owner,
              2026-09-01: *"no need — there is already another notice above that will be kept"*). The
              head of this panel already carries «not in the project» in red, on the same line as the
              address that caused it, and the review screen says it a third time before sending. A
              banner under all that is the product raising its voice at a renter who has understood. */}

          {/* AC-47 — a text↔file disagreement is settled before anything else; confirming over an
              unresolved conflict would pick a site by accident. */}
          {conflictUnresolved && loc.conflict && (
            <div className="mb-3 rounded-sm border border-warn/40 bg-warn-soft p-3.5">
              <div className="flex items-center gap-1.5 text-body font-extrabold text-warn">
                <Icon name="error_outline" size={18} /> {t.step1.location.conflictTitle}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-3 text-start hover:border-brand"
                  onClick={() => actions.resolveLocationConflict("text")}
                >
                  <span className="flex items-center gap-1 text-label font-semibold text-muted">
                    <Icon name="notes" size={14} /> {t.step1.location.fromText}
                  </span>
                  <span className="text-body font-semibold">{loc.conflict.fromText}</span>
                </button>
                <button
                  className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-3 text-start hover:border-brand"
                  onClick={() => actions.resolveLocationConflict("file")}
                >
                  <span className="flex items-center gap-1 text-label font-semibold text-muted">
                    <Icon name="picture_as_pdf" size={14} /> {t.step1.location.fromFile}
                  </span>
                  <span className="text-body font-semibold">{loc.conflict.fromFile}</span>
                </button>
              </div>
            </div>
          )}

          {!conflictUnresolved && (
            <div className="rounded-sm bg-surface2 p-3.5">
              {/* ── The answer sits beside the question (owner, 2026-08-26) ──────────────────────
                  «This is the right spot» was a row of its own under the address box, which read as a
                  second step rather than as the confirmation OF that address. Address and control now
                  share one line.

                  The line is drawn HERE rather than inside the picker, with the picker's own copy
                  suppressed. The picker is loaded through `next/dynamic`: it renders as nothing until it
                  loads, as nothing at all under jsdom, and its address box needs Google to answer
                  first. A button that gates the panel cannot be hostage to any of that. The address
                  is the same string either way — the picker hands it to `patchLocation` as it
                  resolves it, so what is printed below is what it resolved. */}
              <MapLocationPicker
                value={hasLocation ? { lat: loc.lat as number, lng: loc.lng as number } : null}
                label={loc.label}
                onChange={(lat, lng, address) => actions.patchLocation({ lat, lng, label: address || loc.label, source: "map" })}
                hideAddress
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                {hasLocation ? (
                  <span className="flex min-w-0 flex-1 items-start gap-1.5 rounded-sm border border-border bg-surface px-3 py-2">
                    <Icon name="location_on" size={15} className="mt-px flex-none text-brand" />
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-body font-semibold leading-tight text-navy">
                          {loc.label?.trim() || t.step1.location.mapPicker.pinnedNoAddress}
                        </span>
                                              </span>
                      <span className="block text-label text-muted">
                        {(loc.lat as number).toFixed(6)}, {(loc.lng as number).toFixed(6)}
                      </span>
                    </span>
                  </span>
                ) : (
                  <p className="min-w-0 flex-1 text-body leading-snug text-navy-mid">
                    <Icon name="location_on" size={15} className="me-1 align-[-3px] text-brand" />
                    {t.create.wherePanel.dragHint}
                  </p>
                )}
                {confirmControl}
              </div>
            </div>
          )}

          {/* AC-48 — one request, one site. Raised only when the agent genuinely found more than one. */}
          {multi.length > 1 && !state.multiLocationDismissed && (
            <div className="mt-3 flex items-start gap-3 rounded-sm border border-info/25 bg-info-soft px-3.5 py-3">
              <Icon name="pin_drop" size={22} className="flex-none text-info" />
              <div className="min-w-0 text-info-deep">
                <div className="text-body font-extrabold">{t.step1.location.multiLocationTitle}</div>
                <div className="mt-0.5 text-label opacity-85">{t.step1.location.multiLocationBody}</div>
                <ul className="mt-1 list-disc ps-5 text-label opacity-85">
                  {multi.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => window.open(window.location.href, "_blank", "noopener")}
                    className={btn("secondary", "sm")}
                  >
                    {t.step1.location.startSeparateRequest} <Icon name="open_in_new" size={14} />
                  </button>
                  <button
                    onClick={() => actions.dismissMultiLocation()}
                    className="inline-flex items-center rounded-sm px-3 py-1.5 text-label font-semibold text-info/80 hover:text-info"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
