"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { useT } from "@/lib/i18n";
import { readSubmitError } from "@/lib/contract/submit-error";

/**
 * Why a submit did not go through, said to the renter.
 *
 * ── The thing this replaces ─────────────────────────────────────────────────────────────────────
 *
 * Owner, 2026-09-12: *"can we make the error messages clear to the user and user friendly and
 * clearly have the reason, not like this by numbers"*. He had just met, in a red box, over a request
 * that would not post:
 *
 *     Connection problem
 *     Failed to create request
 *     INTERNAL_ERROR · 500
 *
 * Three lines and not one of them answers the question he has, which is *what do I do now?*
 * «Connection problem» was a fixed heading that had nothing to do with the fault; «Failed to create
 * request» was the backend talking to its own logs; and the third line is a number.
 *
 * 🔴 **The code is KEPT, because support needs it** (2026-09-03 put it on screen for exactly that
 * reason). It is a press now instead of a headline, so the renter reads a sentence and the person
 * helping him still gets the string.
 *
 * ⚠️ The tone follows the SIDE the fault is on. Ours is stated as ours, plainly, because a renter
 * told «check your details» about our own 500 goes hunting through a request that is fine.
 */
export function SubmitError({
  detail,
  className,
}: {
  detail:
    | { detail?: string; backendCode?: string; backendStatus?: number; status?: number; details?: unknown }
    | null
    | undefined;
  className?: string;
}) {
  const t = useT();
  const c = t.errors.submit;
  const [copied, setCopied] = useState(false);
  const read = readSubmitError(detail);

  const title = { ours: c.oursTitle, yours: c.yoursTitle, auth: c.authTitle, offline: c.offlineTitle, unknown: c.unknownTitle }[read.key];
  const body = { ours: c.oursBody, yours: c.yoursBody, auth: c.authBody, offline: c.offlineBody, unknown: c.unknownBody }[read.key];

  return (
    <div className={cx("flex items-start gap-3 rounded-md border border-danger/40 bg-danger-soft px-4 py-3", className)}>
      {/* ⚠️ `cloud_off` for a connection and `error_outline` for a refusal: the glyph says which
          kind before the sentence does, and they are the two a renter acts on differently. */}
      <Icon
        name={read.kind === "offline" ? "cloud_off" : "error_outline"}
        size={18}
        className="mt-0.5 flex-none text-danger"
      />
      <div className="min-w-0 flex-1">
        <b className="block text-body font-semibold text-danger">{title}</b>
        <span className="block text-meta leading-relaxed text-danger">{body}</span>

        {/* ⚠️ **The FIELDS the backend refused, named** (owner, 2026-09-12: *"can it be specific,
            like if a field is missing"*). A `VALIDATION_ERROR` has always carried them; the route
            dropped them, so «Validation Error» was as specific as this screen could be. */}
        {read.fields.length > 0 && (
          <ul className="mt-1.5 grid gap-0.5">
            {read.fields.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-meta text-danger">
                <Icon name="arrow_right" size={13} className="mt-px flex-none" />
                {f}
              </li>
            ))}
          </ul>
        )}

        {/* ⚠️ The backend's own words, UNDER ours and only when they read as a sentence. A message
            written for a log is not an explanation; `looksLikeSentence` keeps the ones that
            are and drops the rest, and a named field above wins over both. */}
        {read.detail && (
          <span className="mt-1 block text-meta leading-relaxed text-danger/80">{read.detail}</span>
        )}

        {/* ⚠️ For the person helping him, never for him. It copies rather than printing, so the
            number is one press away and never the thing he reads first. */}
        {read.reference && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(read.reference ?? "").catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2400);
            }}
            className={cx(btn("link"), "mt-1.5 text-label text-danger/80")}
          >
            <Icon name={copied ? "check" : "content_copy"} size={12} />
            {copied ? c.copiedRef : c.copyRef}
          </button>
        )}
      </div>
    </div>
  );
}
