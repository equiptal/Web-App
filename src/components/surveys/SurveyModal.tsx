// ============================================================================
// DISABLED — Outcome Survey UI is commented out (feature switched off).
// Entire original file preserved below as line comments. To restore: strip the
// leading "// " from each line and re-enable the call sites listed in
// docs/surveys-disabled.md.
// ============================================================================

// "use client";

// import { useState } from "react";
// import { useLocale, useT, fmt } from "@/lib/i18n";
// import { Icon } from "@/components/ui";
// import {
//   NO_ONE,
//   SOMEONE_ELSE,
//   buildOutcomeResponse,
//   unitLabel,
//   type PendingItem,
//   type PendingUnit,
//   type RespondBody,
// } from "@/lib/contract/survey";

// /** A response the provider will POST: the survey id + its body. */
// export interface SurveyResponse {
//   surveyId: string;
//   body: RespondBody;
// }

// /**
//  * Outcome Survey modal (renter). Renders the next pending unit — Q1 "Who did you rent from?"
//  * (RENTEE_OUTCOME, a bidder list per item) or Q2 "Still need this?" (RENTEE_NO_BIDS). App parity:
//  * text-only bidder rows, empty (not prefilled) price, no "thank you" screen — the provider drains
//  * to the next unit on resolve. The modal is "dumb": it builds responses and calls `onSubmit`.
//  */
// export function SurveyModal({
//   unit,
//   busy,
//   onSubmit,
//   onClose,
// }: {
//   unit: PendingUnit;
//   busy: boolean;
//   /** Resolve the listed surveys. If any action is `edit`, the provider navigates after posting. */
//   onSubmit: (responses: SurveyResponse[]) => void;
//   onClose: () => void;
// }) {
//   const t = useT();
//   const { locale } = useLocale();
//   const ar = locale === "ar";

//   if (unit.type === "RENTEE_NO_BIDS") {
//     return <NoBidsBody unit={unit} ar={ar} busy={busy} onSubmit={onSubmit} onClose={onClose} t={t} />;
//   }
//   return <OutcomeBody unit={unit} ar={ar} busy={busy} onSubmit={onSubmit} onClose={onClose} t={t} />;
// }

// type T = ReturnType<typeof useT>;

// function Shell({
//   ar,
//   title,
//   onClose,
//   children,
//   footer,
// }: {
//   ar: boolean;
//   title: string;
//   onClose: () => void;
//   children: React.ReactNode;
//   footer: React.ReactNode;
// }) {
//   return (
//     <div
//       className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/45 p-0 sm:items-center sm:p-4"
//       dir={ar ? "rtl" : "ltr"}
//       onClick={onClose}
//     >
//       <div
//         className="flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-lg bg-surface sm:rounded-lg"
//         onClick={(e) => e.stopPropagation()}
//       >
//         <div className="flex items-center justify-between border-b border-border px-5 py-4">
//           <h3 className="text-subhead font-extrabold text-navy">{title}</h3>
//           <button type="button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"} className="text-muted hover:text-navy">
//             <Icon name="close" size={20} />
//           </button>
//         </div>
//         <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
//         <div className="flex flex-col gap-2 border-t border-border px-5 py-4">{footer}</div>
//       </div>
//     </div>
//   );
// }

// /* ── Q2 — still need this? ──────────────────────────────────────────────────── */
// function NoBidsBody({
//   unit,
//   ar,
//   busy,
//   onSubmit,
//   onClose,
//   t,
// }: {
//   unit: PendingUnit;
//   ar: boolean;
//   busy: boolean;
//   onSubmit: (r: SurveyResponse[]) => void;
//   onClose: () => void;
//   t: T;
// }) {
//   const item = unit.items[0];
//   if (!item) return null;
//   return (
//     <Shell
//       ar={ar}
//       title={t.survey.q2Title}
//       onClose={onClose}
//       footer={
//         <>
//           <button
//             type="button"
//             disabled={busy}
//             onClick={() => onSubmit([{ surveyId: item.surveyId, body: { action: "edit" } }])}
//             className="w-full rounded-sm bg-brand px-4 py-2.5 text-body font-semibold text-white disabled:bg-disabled-bg disabled:text-disabled-fg"
//           >
//             {t.survey.edit}
//           </button>
//           <button
//             type="button"
//             disabled={busy}
//             onClick={() => onSubmit([{ surveyId: item.surveyId, body: { action: "close" } }])}
//             className="w-full rounded-sm border border-danger/30 bg-danger-soft px-4 py-2.5 text-body font-semibold text-danger disabled:bg-disabled-bg disabled:text-disabled-fg"
//           >
//             {t.survey.close}
//           </button>
//           <button
//             type="button"
//             disabled={busy}
//             onClick={() => onSubmit([{ surveyId: item.surveyId, body: { action: "skip" } }])}
//             className="w-full py-1.5 text-body font-semibold text-muted disabled:bg-disabled-bg disabled:text-disabled-fg"
//           >
//             {t.survey.skip}
//           </button>
//         </>
//       }
//     >
//       <p className="text-body leading-relaxed text-navy-mid">{t.survey.q2Body}</p>
//     </Shell>
//   );
// }

// /* ── Q1 — who did you rent from? ────────────────────────────────────────────── */
// function OutcomeBody({
//   unit,
//   ar,
//   busy,
//   onSubmit,
//   onClose,
//   t,
// }: {
//   unit: PendingUnit;
//   ar: boolean;
//   busy: boolean;
//   onSubmit: (r: SurveyResponse[]) => void;
//   onClose: () => void;
//   t: T;
// }) {
//   // Per-item state, keyed by surveyId: the chosen supplierId (or SOMEONE_ELSE / NO_ONE), price, reason.
//   const [choice, setChoice] = useState<Record<string, number>>({});
//   const [price, setPrice] = useState<Record<string, string>>({});
//   const [reason, setReason] = useState<Record<string, string>>({});

//   const allAnswered = unit.items.every((it) => choice[it.surveyId] !== undefined);

//   const build = (it: PendingItem): SurveyResponse => ({
//     surveyId: it.surveyId,
//     body: buildOutcomeResponse(choice[it.surveyId], price[it.surveyId] ?? "", reason[it.surveyId] ?? ""),
//   });

//   return (
//     <Shell
//       ar={ar}
//       title={t.survey.q1Title}
//       onClose={onClose}
//       footer={
//         <>
//           <button
//             type="button"
//             disabled={busy || !allAnswered}
//             onClick={() => onSubmit(unit.items.map(build))}
//             className="w-full rounded-sm bg-brand px-4 py-2.5 text-body font-semibold text-white disabled:bg-disabled-bg disabled:text-disabled-fg"
//           >
//             {t.survey.confirm}
//           </button>
//           <button
//             type="button"
//             disabled={busy}
//             onClick={() => onSubmit(unit.items.map((it) => ({ surveyId: it.surveyId, body: { action: "skip" } })))}
//             className="w-full py-1.5 text-body font-semibold text-muted disabled:bg-disabled-bg disabled:text-disabled-fg"
//           >
//             {t.survey.skip}
//           </button>
//         </>
//       }
//     >
//       <div className="flex flex-col gap-5">
//         {unit.items.map((it) => {
//           const sel = choice[it.surveyId];
//           const showPrice = sel !== undefined && sel !== NO_ONE;
//           const showReason = sel === NO_ONE || sel === SOMEONE_ELSE;
//           const unit$ = unitLabel(it.bidders?.[0]?.priceUnit ?? it.rentalType, ar);
//           return (
//             <div key={it.surveyId} className="flex flex-col gap-2.5">
//               <p className="text-body leading-relaxed text-navy-mid">
//                 {fmt(t.survey.q1Question, { equipment: it.requestContext.equipmentSummary || it.requestContext.shortCode || "" })}
//               </p>
//               <div className="flex flex-col gap-1.5">
//                 {(it.bidders ?? []).map((b) => (
//                   <Choice
//                     key={b.bidId}
//                     selected={sel === b.supplierId}
//                     title={b.supplierName}
//                     subtitle={`${b.priceAmount.toLocaleString("en-US")} ${t.common.sar}${b.equipmentName ? ` · ${b.equipmentName}` : ""}`}
//                     onTap={() => setChoice((c) => ({ ...c, [it.surveyId]: b.supplierId }))}
//                   />
//                 ))}
//                 <div className="my-1 h-px bg-border" />
//                 <Choice
//                   selected={sel === SOMEONE_ELSE}
//                   title={t.survey.someoneElse}
//                   onTap={() => setChoice((c) => ({ ...c, [it.surveyId]: SOMEONE_ELSE }))}
//                 />
//                 <Choice
//                   selected={sel === NO_ONE}
//                   title={t.survey.noOne}
//                   onTap={() => setChoice((c) => ({ ...c, [it.surveyId]: NO_ONE }))}
//                 />
//               </div>
//               {showPrice && (
//                 <input
//                   type="number"
//                   inputMode="decimal"
//                   min={0}
//                   value={price[it.surveyId] ?? ""}
//                   onChange={(e) => setPrice((p) => ({ ...p, [it.surveyId]: e.target.value }))}
//                   placeholder={fmt(t.survey.priceLabel, { unit: unit$ })}
//                   className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body text-navy outline-none focus:border-brand"
//                 />
//               )}
//               {showReason && (
//                 <textarea
//                   rows={2}
//                   value={reason[it.surveyId] ?? ""}
//                   onChange={(e) => setReason((r) => ({ ...r, [it.surveyId]: e.target.value }))}
//                   placeholder={sel === NO_ONE ? t.survey.reasonNoOne : t.survey.reasonSomeoneElse}
//                   className="w-full resize-none rounded-sm border border-border bg-surface px-3 py-2.5 text-body text-navy outline-none focus:border-brand"
//                 />
//               )}
//             </div>
//           );
//         })}
//       </div>
//     </Shell>
//   );
// }

// function Choice({
//   selected,
//   title,
//   subtitle,
//   onTap,
// }: {
//   selected: boolean;
//   title: string;
//   subtitle?: string;
//   onTap: () => void;
// }) {
//   return (
//     <button
//       type="button"
//       onClick={onTap}
//       className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-start transition ${
//         selected ? "border-brand bg-brand-soft" : "border-border bg-surface hover:bg-surface2"
//       }`}
//     >
//       <Icon name={selected ? "radio_button_checked" : "radio_button_unchecked"} size={20} className={selected ? "text-brand" : "text-muted"} />
//       <span className="min-w-0 flex-1">
//         <span className="block truncate text-body font-semibold text-navy">{title}</span>
//         {subtitle && <span className="block truncate text-meta font-semibold text-muted">{subtitle}</span>}
//       </span>
//     </button>
//   );
// }
