"use client";

import { Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { btn } from "@/lib/ds";

/**
 * Marketplace · My Bids — gate shown when an UNVERIFIED renter tries to issue a quotation (app parity:
 * issueQuotationNotVerified*). Explains that to put the company name/details on the quotation they must
 * verify; lets them Verify, or Continue without it (quotation uses their personal name/info).
 */
export function QuotationVerifyGate({
  L,
  onVerify,
  onContinue,
  onClose,
}: {
  L: (en: string, arr: string) => string;
  onVerify: () => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  return (
    /* The shared dialog, not a scrim of its own (owner, 2026-08-28: one design for every modal).
       It drew `bg-black/45` where the system's scrim is navy at 45%, and its own panel, header and
       close — four decisions already made once in `Dialog`. */
    <Dialog
      open
      onClose={onClose}
      size="sm"
      icon={
        <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-warn-soft text-warn">
          <Icon name="verified_user" size={19} />
        </span>
      }
      title={L("Your account isn't verified yet", "لم يتم توثيق حسابك بعد")}
      footer={
        <>
          <button onClick={onContinue} className={btn("secondary", "md", { className: "transition" })}>
            {L("Continue without it", "المتابعة بدون ذلك")}
          </button>
          <button onClick={onVerify} className={btn("primary", "md")}>
            <Icon name="verified_user" size={17} /> {L("Verify", "توثيق")}
          </button>
        </>
      }
    >
      <p className="text-body leading-relaxed text-muted">
              {L(
                "If you want the quotation to show your company name and details instead of your personal name and information, please verify your account first.",
                "إذا كنت ترغب في أن يظهر اسم شركتك وبياناتها في عرض السعر بدلاً من اسمك ومعلوماتك الشخصية، يُرجى توثيق حسابك أولاً.",
              )}
      </p>
    </Dialog>
  );
}
