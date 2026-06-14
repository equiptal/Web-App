import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

/**
 * Account-creation route (web-app/003 Flow 1). Standalone (own chrome, not the AppShell). Reads the
 * `next` deep-link so a renter who arrived from a tier-gated action returns there after becoming basic.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <OnboardingShell step={1}>
      <OnboardingForm next={next ?? "/"} />
    </OnboardingShell>
  );
}
