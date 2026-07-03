"use client";

import { useRouter, usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";

/**
 * Empty state for signed-out visitors on account-bound surfaces (public-web-auth-gate). Shown instead
 * of an error/redirect when the session is anon — a clear nudge rather than a broken-looking page.
 * Defaults to a "Sign in" CTA (→ `/login?next=<here>`), but callers can override the copy, icon, and
 * CTA (e.g. the Requests tab nudges "Create request" → /create).
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
  /** Override the button target (defaults to `/login?next=<current path>`). */
  ctaHref?: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const go = () => router.push(ctaHref ?? `/login?next=${encodeURIComponent(pathname)}`);
  return (
    <div className="rounded-[12px] border border-border bg-surface p-8 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="text-[16px] font-extrabold text-navy">{title ?? t.browse.signInTitle}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{body ?? t.browse.signInBody}</p>
      <button
        onClick={go}
        className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-105"
      >
        <Icon name={ctaLabel ? "add" : "login"} size={17} /> {ctaLabel ?? t.shell.signIn}
      </button>
    </div>
  );
}
