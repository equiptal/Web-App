"use client";

import { useRouter, usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";

/**
 * Interim empty state for signed-out visitors on surfaces whose data still requires an account
 * (public-web-auth-gate). Shown instead of an error/retry panel when the session is anon — a clear
 * "sign in" nudge rather than a broken-looking error. Personal surfaces (compare, activity) keep this
 * permanently; supplier/store browse flips to real public data once the backend browse endpoint (T7)
 * lands. Sends the visitor to `/login?next=<here>` so they return after signing in.
 */
export function SignInPrompt({ title, body }: { title?: string; body?: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="rounded-[12px] border border-border bg-surface p-8 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon name="lock" size={24} />
      </span>
      <h3 className="text-[16px] font-extrabold text-navy">{title ?? t.browse.signInTitle}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{body ?? t.browse.signInBody}</p>
      <button
        onClick={() => router.push(`/login?next=${encodeURIComponent(pathname)}`)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-105"
      >
        <Icon name="login" size={17} /> {t.shell.signIn}
      </button>
    </div>
  );
}
