"use client";

import { Icon } from "@/components/ui";
import { btn } from "@/lib/ds";

/**
 * Marketplace · My Bids — gate shown when an UNVERIFIED renter tries to issue a quotation (app parity:
 * issueQuotationNotVerified*). Explains that to put the company name/details on the quotation they must
 * verify; lets them Verify, or Continue without it (quotation uses their personal name/info).
 */
export function QuotationVerifyGate({
  ar,
  L,
  onVerify,
  onContinue,
  onClose,
}: {
  ar: boolean;
  L: (en: string, arr: string) => string;
  onVerify: () => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center" dir={ar ? "rtl" : "ltr"} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[440px] rounded-t-lg bg-surface p-5 sm:rounded-lg">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-warn-soft text-warn">
            <Icon name="verified_user" size={24} />
          </span>
          <div className="flex-1">
            <h3 className="text-title font-extrabold text-navy">{L("Your account isn't verified yet", "لم يتم توثيق حسابك بعد")}</h3>
            <p className="mt-1.5 text-body leading-relaxed text-muted">
              {L(
                "If you want the quotation to show your company name and details instead of your personal name and information, please verify your account first.",
                "إذا كنت ترغب في أن يظهر اسم شركتك وبياناتها في عرض السعر بدلاً من اسمك ومعلوماتك الشخصية، يُرجى توثيق حسابك أولاً.",
              )}
            </p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 flex-none place-items-center rounded-full text-muted hover:bg-surface2"><Icon name="close" size={18} /></button>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button onClick={onContinue} className={btn("secondary", "md", { className: "transition" })}>
            {L("Continue without it", "المتابعة بدون ذلك")}
          </button>
          <button onClick={onVerify} className={btn("primary", "md")}>
            <Icon name="verified_user" size={17} /> {L("Verify", "توثيق")}
          </button>
        </div>
      </div>
    </div>
  );
}
