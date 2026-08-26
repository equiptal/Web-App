"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { useAuthGate } from "@/components/auth/AuthGate";

/**
 * Empty state for signed-out visitors on account-bound surfaces (public-web-auth-gate). Shown instead
 * of an error/redirect when the session is anon — a clear nudge rather than a broken-looking page.
 * The default "Sign in" CTA opens the in-app auth modal (there is no /login page); callers can override
 * the copy, icon, and give a `ctaHref` to navigate instead (e.g. Requests nudges "Create request" → /create).
 */
export function SignInPrompt({
  title,
  body,
  icon = "lock",
  ctaLabel,
  ctaHref,
}: {
  title?: string;
  body?: string;
  icon?: string;
  /** Override the button label (defaults to "Sign in"). */
  ctaLabel?: string;
  /** Navigate to this target instead of opening the auth modal (e.g. "/create"). */
  ctaHref?: string;
}) {
  const t = useT();
  const router = useRouter();
  const { openAuth } = useAuthGate();
  // A custom target navigates (e.g. "Create request" → /create); the default sign-in CTA opens the
  // auth modal in place (no /login page).
  const go = () => (ctaHref ? router.push(ctaHref) : openAuth());
  return (
    <div className="rounded-sm border border-border bg-surface p-8 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="text-subhead font-extrabold text-navy">{title ?? t.browse.signInTitle}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-body leading-relaxed text-muted">{body ?? t.browse.signInBody}</p>
      <button
        onClick={go}
        className="mt-4 inline-flex items-center gap-1.5 rounded-sm bg-brand px-5 py-2.5 text-body font-semibold text-white transition"
      >
        <Icon name={ctaLabel ? "add" : "login"} size={17} /> {ctaLabel ?? t.shell.signIn}
      </button>
    </div>
  );
}
