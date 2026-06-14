import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { VerificationFlow } from "@/components/onboarding/VerificationFlow";

/**
 * Company-verification route (web-app/003 Flows 2/3). Standalone chrome (step 2). The flow handles
 * the guest→onboarding gate (AC-08) and the pending/verified/rejected states client-side.
 */
export default function VerifyPage() {
  return (
    <OnboardingShell step={2}>
      <VerificationFlow />
    </OnboardingShell>
  );
}
