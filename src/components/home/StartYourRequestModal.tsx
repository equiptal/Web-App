"use client";

import { useLocale, useT } from "@/lib/i18n";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";

/** mobile/016 — the renter's choice on the first-request "Start Your Request" pop-up. */
export type StartRequestChoice = "trial" | "real";

/**
 * mobile/016 — the web twin of the app's `showStartYourRequestPopup` dialog. Shown on the home hub the
 * first time a renter arrives without having completed a request yet, offering the same two paths in the
 * same order: **Trial Request** (emphasized, on top) and **Real Request**.
 *
 * Both choices lead into the normal RFQ flow at `/create` ("Write your RFQ") — a trial only differs in
 * what the backend does with the submission (no supplier dispatch, sample bids, 60-min TTL).
 *
 * Dismissing (×, CANCEL AND RETURN, or the backdrop) leaves the first-request slot open, so the pop-up
 * returns on the renter's next visit — app parity (AC-20).
 */
export function StartYourRequestModal({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: StartRequestChoice) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  if (!open) return null;

  return (
    <Dialog open onClose={onClose} size="md" padded={false}>
      <div
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="p-5 sm:p-6"
      >
        {/* Header: title + × */}
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-[19px] font-extrabold tracking-tight text-navy">{t.startRequest.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.startRequest.close}
            className="-me-1 -mt-1 grid h-8 w-8 flex-none place-items-center rounded-[9px] text-muted transition hover:bg-surface2 hover:text-navy"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Trial Request — emphasized, first (app parity). */}
        <div className="mt-4 flex flex-col gap-3">
          <ChoiceCard
            emphasized
            icon="science"
            title={t.startRequest.trialTitle}
            body={t.startRequest.trialBody}
            onClick={() => onChoose("trial")}
          />
          <ChoiceCard
            emphasized={false}
            icon="campaign"
            title={t.startRequest.realTitle}
            body={t.startRequest.realBody}
            onClick={() => onChoose("real")}
          />
        </div>

        {/* CANCEL AND RETURN — dismiss; the slot stays open (AC-20). */}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-[10px] py-2.5 text-[12px] font-bold uppercase tracking-[0.5px] text-navy-mid transition hover:bg-surface2"
        >
          {t.startRequest.cancel}
        </button>
      </div>
    </Dialog>
  );
}

function ChoiceCard({
  emphasized,
  icon,
  title,
  body,
  onClick,
}: {
  emphasized: boolean;
  icon: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[14px] p-4 text-start transition ${
        emphasized
          ? "border-2 border-brand bg-brand-soft hover:brightness-[0.99]"
          : "border border-border bg-surface hover:bg-surface2"
      }`}
    >
      <span
        className={`grid h-11 w-11 flex-none place-items-center rounded-[10px] ${
          emphasized ? "bg-brand text-white" : "bg-surface2 text-navy-mid"
        }`}
      >
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[14.5px] font-bold text-navy">{title}</b>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{body}</span>
      </span>
      <Icon
        name="chevron_right"
        size={20}
        className={`flex-none rtl:scale-x-[-1] ${emphasized ? "text-brand" : "text-muted"}`}
      />
    </button>
  );
}
