"use client";

/**
 * **The app's own date picker** (owner, 2026-10-04).
 *
 * The date fields were native `<input type="date">`, bounded by each other: the start's `max` was
 * the end date and the end's `min` the start. A renter whose end date was 30 April opened the start
 * picker, found every later day greyed out, and read the field as broken. Nothing on screen said the
 * end date was the reason, and the browser's popup cannot carry a word of ours.
 *
 * The owner's ruling: *"keep the days showing but when someone selects start after the end date show
 * a red note at the bottom of the calender window saying start cant be after end date, change one of
 * them and dont allow the selection"*. So every day is pickable-looking, a pick that would run the
 * window backwards is REFUSED (the value does not change, the calendar stays open) and the reason is
 * said in red at the bottom of this popup, where the renter is looking.
 *
 * ~~A muted «Start can't be after the end date» line under the fields, always on.~~ Shipped and
 * withdrawn the same day (owner: *"the start 6-10 and end is 8-10 why this message appear?"*): it
 * warned about a problem the renter did not have.
 *
 * The popup is a PORTAL placed from the trigger's rect, closing on an outside click, Escape and an
 * ancestor scroll, for the reasons `Dropdown` gives: one of these lives in a scrolling dialog.
 *
 * Dates are `YYYY-MM-DD` strings throughout, the same shape the inputs had, so the stores and
 * payloads are untouched; ISO strings compare correctly as strings. Latin digits and the Gregorian
 * calendar in both locales.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useLocale, useT } from "@/lib/i18n";
import { pin } from "@/lib/uiPins";

/** Roughly what the open calendar needs, with the note. Only used to decide which way to open. */
const PANEL_HEIGHT = 380;
const PANEL_WIDTH = 288;

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayKey = () => {
  const n = new Date();
  return keyOf(n.getFullYear(), n.getMonth(), n.getDate());
};
/** `YYYY-MM-DD` to a local date at noon, so no timezone can tip it into the day before. */
const parse = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)), 12);

export function DatePicker({
  value,
  onChange,
  notAfter,
  notBefore,
  conflict,
  label,
  triggerClass,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  /** A pick later than this is refused: the START field, bounded by the end date. */
  notAfter?: string | null;
  /** A pick earlier than this is refused: the END field, bounded by the start date. */
  notBefore?: string | null;
  /** The red note shown when a pick is refused. */
  conflict: string;
  /** Accessible name for the trigger. */
  label: string;
  /** The trigger's skin, which belongs to the surface it sits on. */
  triggerClass: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const intl = locale === "ar" ? "ar-u-nu-latn-ca-gregory" : "en-GB";

  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  /** The month on show, as its first day. */
  const [month, setMonth] = useState(() => {
    const d = value ? parse(value) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (boxRef.current?.contains(node) || panelRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const away = (e: Event) => {
      const node = e.target as Node | null;
      if (node && panelRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  const openPanel = () => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      const up = below < PANEL_HEIGHT && rect.top > below;
      const wanted = up ? rect.top - 4 - PANEL_HEIGHT : rect.bottom + 4;
      const rtl = boxRef.current ? getComputedStyle(boxRef.current).direction === "rtl" : false;
      // Anchored to the trigger's inline-start edge, clamped to the window.
      const start = rtl ? rect.right - PANEL_WIDTH : rect.left;
      setAt({
        top: Math.max(8, Math.min(wanted, window.innerHeight - PANEL_HEIGHT - 8)),
        left: Math.max(8, Math.min(start, window.innerWidth - PANEL_WIDTH - 8)),
      });
    }
    const d = value ? parse(value) : new Date();
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setRefused(false);
    setOpen(true);
  };

  /** Every pick goes through here, so «Today» obeys the same rule as a day in the grid. */
  const pick = (k: string) => {
    if ((notAfter && k > notAfter) || (notBefore && k < notBefore)) {
      setRefused(true);
      return;
    }
    onChange(k);
    setOpen(false);
  };

  const step = (by: number) => {
    setRefused(false);
    setMonth(({ y, m }) => {
      const d = new Date(y, m + by, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const first = new Date(month.y, month.m, 1);
  const daysIn = new Date(month.y, month.m + 1, 0).getDate();
  // Weeks start on Sunday, as the Saudi week does and as the browser's picker did.
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intl, { weekday: "short" }).format(new Date(2026, 1, 1 + i)),
  ); // 1 Feb 2026 is a Sunday.
  const today = todayKey();

  return (
    <div {...pin("date-picker")} ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={`flex items-center justify-between gap-2 text-start ${triggerClass}`}
      >
        <span className={value ? "" : "text-muted"}>
          {value
            ? new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric" }).format(parse(value))
            : t.common.datePick}
        </span>
        <Icon name="calendar_month" size={16} className="flex-none opacity-60" />
      </button>

      {open && at && createPortal(
        <div
          {...pin("date-picker-panel")}
          ref={panelRef}
          role="dialog"
          aria-label={label}
          // `z-[70]`, above the dialog shell's `z-[60]` scrim, as `Dropdown`'s list.
          style={{ position: "fixed", top: at.top, left: at.left, width: PANEL_WIDTH }}
          className="z-[70] overflow-hidden rounded-md border border-border bg-surface text-navy"
        >
          <div className="flex items-center justify-between px-3 pt-3">
            <span className="text-body font-extrabold">
              {new Intl.DateTimeFormat(intl, { month: "long", year: "numeric" }).format(first)}
            </span>
            <span className="flex gap-1">
              <button type="button" onClick={() => step(-1)} aria-label={t.common.prevMonth} className="grid h-7 w-7 place-items-center rounded-sm hover:bg-surface2">
                <Icon name="chevron_left" size={18} className="rtl:rotate-180" />
              </button>
              <button type="button" onClick={() => step(1)} aria-label={t.common.nextMonth} className="grid h-7 w-7 place-items-center rounded-sm hover:bg-surface2">
                <Icon name="chevron_right" size={18} className="rtl:rotate-180" />
              </button>
            </span>
          </div>

          <div className="grid grid-cols-7 gap-0.5 px-3 pb-2 pt-2 text-center">
            {weekdays.map((w) => (
              <span key={w} className="py-1 text-meta font-semibold text-muted">{w}</span>
            ))}
            {cells.map((d, i) => {
              if (d == null) return <span key={`b${i}`} />;
              const k = keyOf(month.y, month.m, d);
              const chosen = k === value;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pick(k)}
                  aria-pressed={chosen}
                  aria-label={new Intl.DateTimeFormat(intl, { dateStyle: "full" }).format(parse(k))}
                  className={`h-8 rounded-sm text-body transition ${
                    chosen ? "bg-navy font-extrabold text-white" : k === today ? "font-extrabold text-brand-deep hover:bg-surface2" : "hover:bg-surface2"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-body font-semibold">
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="text-muted hover:text-navy">
              {t.common.clear}
            </button>
            <button type="button" onClick={() => pick(today)} className="text-brand-deep hover:text-navy">
              {t.common.today}
            </button>
          </div>

          {refused && (
            <p
              {...pin("date-picker-conflict")}
              role="alert"
              className="flex items-start gap-1.5 border-t border-danger/40 bg-danger/[0.08] px-3 py-2 text-meta font-semibold text-danger"
            >
              <Icon name="error" size={14} className="mt-px flex-none" />
              {conflict}
            </p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
