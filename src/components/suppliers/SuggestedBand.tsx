"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { fmt, useT } from "@/lib/i18n";
import { addRenterSupplier, listSupplierSuggestions, type SupplierSuggestion } from "@/lib/api/client";

/**
 * SUP-T24 — suppliers who bid on this renter's requests but hold no row yet.
 *
 * ── A suggestion, never an insert ───────────────────────────────────────────────────────────────
 *
 * The list is the renter's own, and a row he did not put there is a row he cannot account for. So
 * every one of these needs a tap. What it saves is the retyping: the firm's name and number are
 * already on the bid they sent, and asking him to copy them out of one screen into another is work
 * we can do for him.
 *
 * ── Dismissal is per person, and not a write ────────────────────────────────────────────────────
 *
 * It lives in `localStorage`. A colleague who wants these suppliers should still see them, and a
 * server round-trip to remember "not now" is a table nobody will ever read on purpose.
 */
const DISMISSED = "moedatech.suppliers.suggestionsDismissed";

export function SuggestedBand({ onAdded }: { onAdded: (message: string) => void }) {
  const t = useT();
  const c = t.suppliers;
  const [items, setItems] = useState<SupplierSuggestion[]>([]);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Reading storage can throw in a locked-down browser; an unavailable preference is "show it".
    try {
      setDismissed(window.localStorage.getItem(DISMISSED) === "1");
    } catch {
      setDismissed(false);
    }
    listSupplierSuggestions().then(setItems);
  }, []);

  if (dismissed || items.length === 0) return null;

  const add = async (s: SupplierSuggestion) => {
    setBusy(s.phone ?? s.companyName);
    try {
      await addRenterSupplier({
        name: s.companyName,
        phone: s.phone ?? null,
        crNumber: s.crNumber ?? null,
        // Not a registered vendor by default: they bid, which is not the same as the renter having
        // decided to work with them. He can raise the flag on the row in one click.
        vendorRegistered: false,
      });
      setItems((list) => list.filter((x) => x !== s));
      onAdded(fmt(c.added, { name: s.companyName }));
    } catch {
      onAdded(c.saveFailed);
    }
    setBusy(null);
  };

  const hide = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      /* A browser that refuses storage just shows it again next time. */
    }
  };

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2.5 rounded-md border border-info/30 bg-info-soft px-3 py-2.5 text-meta">
      <Icon name="person_add" size={15} className="flex-none text-info-deep" />
      <b className="font-extrabold text-info-deep">{c.suggestedTitle}</b>
      <span className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <span
            key={s.phone ?? s.companyName}
            className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-info/30 bg-surface py-0 pe-1 ps-2.5 font-semibold text-navy"
          >
            {s.companyName}
            <span className="text-muted">{s.via === "link" ? c.suggestedViaLink : c.suggestedOnApp}</span>
            <button
              type="button"
              disabled={busy !== null}
              title={c.addToMySuppliers}
              onClick={() => add(s)}
              className="grid h-5 w-5 place-items-center rounded-full bg-info text-surface transition hover:bg-info-deep disabled:bg-disabled-bg disabled:text-disabled-fg"
            >
              <Icon name="add" size={13} />
            </button>
          </span>
        ))}
      </span>
      <button type="button" onClick={hide} className="ms-auto font-semibold text-info-deep hover:underline">
        {c.dismiss}
      </button>
    </div>
  );
}
