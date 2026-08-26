"use client";

import { useLocale, useT } from "@/lib/i18n";
import type { RequestListItem } from "@/lib/contract/requests";
import { cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * **Every machine in the submission, on one line** (owner, 2026-08-27).
 *
 * A multi-item RFQ fans out into one request per machine type and the workspace shows one at a time.
 * The context bar names the current one and its caret reaches the rest — but reaching them takes a
 * press, and the owner wants the others *read* rather than *found*: "i want user to know easily the
 * other equipments he has".
 *
 * ── Why it is a row of its own, under the rail ────────────────────────────────────────────────
 * Because the names are long. «Impact Hammer (Diesel/Hydraulic)» is about 300px, and the context
 * bar's half of the tabs row is roughly 590 on a 1440 page once the centred tabs and the export have
 * taken theirs — so two of those would not fit beside each other there, let alone three. Here the
 * row is the full width of the page and every item can say its whole name.
 *
 * It sits under the request circles because it is the same question one level in: those choose the
 * REQUEST, these choose the machine within it.
 *
 * ── It draws nothing for a single-item request ────────────────────────────────────────────────
 * One chip that cannot be departed from is furniture, and this row costs 34px of every page it
 * appears on. The workspace renders it only where there is a choice.
 */
export function ItemTier({
  items,
  activeId,
  onPick,
}: {
  /** Every item in the submission, in the order it was asked for. */
  items: RequestListItem[];
  activeId: string | null;
  onPick: (itemId: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";

  return (
    <div
      {...pin("item-tier")}
      className="flex h-[34px] flex-none items-center gap-1.5 overflow-x-auto border-b border-border bg-surface2 px-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
    >
      <span className="flex-none text-label font-extrabold uppercase tracking-wide text-muted">
        {t.workspace.itemsInRequest}
      </span>
      {items.map((it) => {
        const on = it.id === activeId;
        const qty = it.item?.qty ?? 1;
        const name = it.item ? (ar ? it.item.nameAr || it.item.name : it.item.name) : it.displayId;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onPick(it.id)}
            aria-current={on ? "true" : undefined}
            title={name ?? undefined}
            /* The chosen one is navy, like the context bar that names it — the two are the same fact
               in two places, so they wear the same colour. The rest are quiet until pressed. */
            className={cx(
              "flex max-w-[260px] flex-none items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-meta font-semibold transition-colors",
              on
                ? "border-navy bg-navy text-white"
                : "border-border bg-surface text-navy-mid hover:border-border-strong hover:bg-surface2 hover:text-navy",
            )}
          >
            <span className="truncate">{name}</span>
            {qty > 1 && (
              <span className={cx("flex-none text-label", on ? "text-white/70" : "text-muted")}>×{qty}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
