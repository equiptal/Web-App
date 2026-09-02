"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import {
  bidShareUrl,
  fetchAllMyRequests,
  recordRequestShare,
  updateRenterSupplier,
  type RenterSupplier,
} from "@/lib/api/client";
import type { RequestListItem } from "@/lib/contract/requests";
import { canBeEmailed } from "@/lib/contract/renter-suppliers";
import { bidCardText } from "@/lib/bidCardText";
import { useBidCard } from "@/lib/useBidCard";
import { openEmailCompose } from "@/lib/composeEmail";

/**
 * *Share a request* — from the supplier list, the prototype's `dlgShare`.
 *
 * ── Two doors, on purpose ───────────────────────────────────────────────────────────────────────
 *
 * A request can also be shared from the request itself, and the prototype's own note says why both
 * exist: *"pick the suppliers first, or pick the request first. Both write the same record, so either
 * way it lands under «What you sent them» and on the request itself."*
 *
 * A renter on this screen is thinking about people; a renter on a request is thinking about a job.
 * Making him navigate to the other one first is making him translate his own question.
 *
 * ── The only thing this adds is «which request» ─────────────────────────────────────────────────
 *
 * Everything else — the recipients, the BCC, the body, the naming of who gets skipped — is what the
 * request-side sheet already does, from the same `bidCardText`. So the two doors cannot start saying
 * different things.
 *
 * ── Only requests that HAVE a link ──────────────────────────────────────────────────────────────
 *
 * The link is minted per request, so a request with no uuid cannot be shared. Rather than list one
 * and fail on the press, the picker lists what can actually be sent.
 */
export function ShareRequestDialog({
  open,
  suppliers,
  preselect,
  onClose,
  onShared,
}: {
  open: boolean;
  suppliers: RenterSupplier[];
  /** Rows already chosen — the row action shares with one, the toolbar starts empty. */
  preselect: RenterSupplier[];
  onClose: () => void;
  onShared: (message: string) => void;
}) {
  const t = useT();
  const c = t.suppliers;
  const { locale } = useLocale();
  const lang = locale === "ar" ? "ar" : "en";

  const [requests, setRequests] = useState<RequestListItem[] | null>(null);
  const [requestId, setRequestId] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [addingEmailOn, setAddingEmailOn] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [rows, setRows] = useState<RenterSupplier[]>(suppliers);

  useEffect(() => setRows(suppliers), [suppliers]);

  useEffect(() => {
    if (!open) return;
    setPicked(Object.fromEntries(preselect.map((s) => [s.id, true])));
    if (requests) return;
    fetchAllMyRequests()
      .then(({ requests: r }) => setRequests(r))
      .catch(() => setRequests([]));
    // `preselect` is a new array each render; the open flag is what should re-seed the picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** What can actually be sent: a request needs a link, and a link needs its own id. */
  const sendable = useMemo(
    () => (requests ?? []).filter((r) => !!(r.requestGroupId || r.id)),
    [requests],
  );

  useEffect(() => {
    if (!requestId && sendable.length) setRequestId(sendable[0].requestGroupId || sendable[0].id);
  }, [sendable, requestId]);

  const shareUrl = useMemo(() => {
    if (!requestId || typeof window === "undefined") return "";
    return bidShareUrl(window.location.origin, requestId, null);
  }, [requestId]);

  const card = useBidCard(shareUrl, lang);

  const chosen = rows.filter((s) => picked[s.id]);
  const reachable = chosen.filter(canBeEmailed);
  const unreachable = chosen.filter((s) => !canBeEmailed(s));

  const body = card
    ? bidCardText(card.model, shareUrl, { note, lang })
    : [note.trim() || null, shareUrl || null].filter(Boolean).join("\n\n");

  const chosenRequest = sendable.find((r) => (r.requestGroupId || r.id) === requestId) ?? null;

  const send = () => {
    if (!reachable.length || !requestId || sending) return;
    setSending(true);
    // Recorded first and never awaited: an audit row must not stand between the renter and his mail.
    void recordRequestShare(requestId, reachable.map((s) => s.id), "email");
    openEmailCompose({
      bcc: reachable.map((s) => s.email as string),
      subject: fmt(c.shareSubject, { code: chosenRequest?.displayId ?? "" }).trim(),
      body,
    });
    setSending(false);
    onShared(
      reachable.length === 1
        ? c.sharedOne
        : fmt(c.sharedMany, { n: reachable.length }),
    );
  };

  const saveEmail = async (s: RenterSupplier) => {
    const email = emailDraft.trim();
    if (!email) return;
    setRows((list) => list.map((x) => (x.id === s.id ? { ...x, email } : x)));
    setAddingEmailOn(null);
    setEmailDraft("");
    try {
      await updateRenterSupplier(s.id, { email });
    } catch {
      setRows((list) => list.map((x) => (x.id === s.id ? { ...x, email: s.email } : x)));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Icon name="share" size={18} />}
      title={c.shareARequest}
      subtitle={c.shareSubtitle}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="text-meta text-muted">
            {reachable.length
              ? fmt(c.shareCount, { n: reachable.length })
              : c.sharePickOne}
            {unreachable.length > 0 && (
              <span className="font-extrabold text-danger-deep"> · {fmt(c.shareSkipped, { n: unreachable.length })}</span>
            )}
          </span>
          <span className="ms-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={btn("ghost", "md")}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={send}
              disabled={!reachable.length || !requestId || sending}
              className={btn("primary", "md")}
            >
              <Icon name="send" size={15} />
              {reachable.length ? fmt(c.shareSend, { n: reachable.length }) : c.shareSendNone}
            </button>
          </span>
        </div>
      }
    >
      <div className="grid gap-4">
        <label className="grid gap-1">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.whichRequest}</span>
          {requests === null ? (
            <span className="text-meta text-muted">{c.loading}</span>
          ) : sendable.length === 0 ? (
            <span className="text-meta text-muted">{c.noRequests}</span>
          ) : (
            <select
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              className="h-[34px] rounded-md border border-border-strong bg-surface px-2.5 text-meta font-semibold text-navy"
            >
              {sendable.map((r) => (
                <option key={r.id} value={r.requestGroupId || r.id}>
                  {[r.displayId, r.city].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          )}
        </label>

        <div className="grid gap-1.5">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.recipients}</span>
          <div className="max-h-[210px] overflow-auto rounded-md border border-border">
            <ul>
              {rows.map((s) => (
                <li key={s.id} className="border-b border-border last:border-b-0">
                  <div className="flex items-center gap-2.5 px-2.5 py-2">
                    <input
                      type="checkbox"
                      checked={!!picked[s.id]}
                      onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.checked }))}
                      className="h-3.5 w-3.5 flex-none accent-ok"
                    />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-meta font-semibold text-navy">{s.name}</b>
                      <span className="block truncate text-label text-muted" dir="ltr">
                        {s.email || c.noEmailCol}
                      </span>
                    </span>
                    {/* Fixed here, or the selection he is building is lost to another screen. */}
                    {!canBeEmailed(s) &&
                      (addingEmailOn === s.id ? (
                        <span className="flex flex-none items-center gap-1.5">
                          <input
                            autoFocus
                            value={emailDraft}
                            onChange={(e) => setEmailDraft(e.target.value)}
                            placeholder="name@company.com"
                            className="h-[26px] w-[160px] rounded-sm border border-border-strong px-2 text-meta text-navy outline-none focus:border-brand"
                          />
                          <button type="button" onClick={() => void saveEmail(s)} className="text-meta font-semibold text-brand">
                            {t.common.save}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingEmailOn(s.id);
                            setEmailDraft("");
                          }}
                          className="flex-none text-meta font-semibold text-brand"
                        >
                          {c.addEmailShort}
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <label className="grid gap-1">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.yourLine}</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={c.yourLineHint}
            className="rounded-sm border border-border bg-surface p-2.5 text-meta text-navy outline-none focus:border-brand"
          />
        </label>

        <div className="grid gap-1">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.whatTheyGet}</span>
          <p className={cx("max-h-[190px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface2 px-3 py-2.5 text-meta text-navy")}>
            {body}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
