"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { JOIN_URL } from "@/lib/config/store-links";
import { copyInvite } from "@/lib/inviteCardHtml";
import { recordSupplierInvite } from "@/lib/api/client";
import { bidCount, type RenterSupplier } from "@/lib/contract/renter-suppliers";

/**
 * SUP-T42 — inviting an off-platform supplier onto Moedatech.
 *
 * ── One message, every channel ──────────────────────────────────────────────────────────────────
 *
 * WhatsApp, e-mail, SMS and copy-to-clipboard all send the same body from the same key, ending at
 * `JOIN_URL` (SUP-T01). E-mail adds a subject and nothing else. A second body would be a second
 * thing to keep true, and the first time one of them changed the two would start saying different
 * things about the same product.
 *
 * ── Two bodies, chosen for him, not by him ──────────────────────────────────────────────────────
 *
 * A supplier who has already bid through the shared link is told *"I received your bid"*; one who
 * never has is told what the app is for. Same shape, same ending, and the renter is not asked to
 * pick — the list already knows which of the two is true.
 *
 * ── His voice, not ours (owner, 2026-09-01) ─────────────────────────────────────────────────────
 *
 * It opens his own WhatsApp, his own mail client. A supplier who has worked with him for years
 * recognises the sender; a message from a Moedatech address is a colder one with a worse reply rate,
 * and the reply would land nowhere he looks.
 *
 * ⚠️ The prototype (`dlgJoinInvite`) draws this as an e-mail FROM `hello@moedatech.net`, with the two
 * store badges. Sending it from us is not what the owner wants and there is no endpoint that could —
 * `/agents/renter-suppliers/invites` records a send, it does not make one. And a `mailto:` body is
 * plain text, so the badges cannot ride an e-mail the renter sends himself.
 *
 * They ride the CLIPBOARD instead. *Copy* writes the prototype's card as `text/html` and the plain
 * sentence as `text/plain`, so a paste into Gmail gets the badges and a paste into WhatsApp gets the
 * words — the same trick the bid link already uses, and for the same reason: what we cannot send, we
 * can hand over.
 *
 * ── Recorded, for the two channels the record has a word for ────────────────────────────────────
 *
 * SUP-BE-15 takes `channel: "email" | "whatsapp"`, so those two land on the supplier's history the
 * moment the client opens. SMS and the clipboard are sent the same message and are NOT recorded —
 * the enum has no value for them, and writing them as "email" would put a lie in an audit row. The
 * dialog says which of the four leave a trace rather than letting a renter discover it from a
 * profile that is missing an entry he remembers making.
 */
export function InviteSupplierDialog({
  supplier,
  onClose,
}: {
  supplier: RenterSupplier | null;
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const c = t.suppliers;
  const [copied, setCopied] = useState(false);
  /**
   * The renter's own firm, for the card's opening line — *"Zahid Contracting already works with
   * you"*. Read here, once, and only when someone is actually being invited: it is one line of one
   * card, which does not justify a fetch on every page that might one day open this.
   *
   * A failure is not an error. The card has a lead that names no one, and a nameless sentence beats a
   * dialog that will not open.
   */
  const [renterName, setRenterName] = useState<string | null>(null);

  useEffect(() => {
    if (!supplier) return;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { companyName?: string | null } | null) => setRenterName(me?.companyName?.trim() || null))
      .catch(() => setRenterName(null));
  }, [supplier]);

  if (!supplier) return null;

  const name = supplier.contactName?.trim() || supplier.name;
  // The list already knows which of the two is true, so the renter is not asked.
  const message = fmt(bidCount(supplier) > 0 ? t.workspace.inviteMessage : c.inviteMessageCold, {
    supplier: name,
    url: JOIN_URL,
  });

  const phone = supplier.phone?.replace(/[^\d+]/g, "") ?? "";
  const email = supplier.email?.trim() ?? "";
  const enc = encodeURIComponent(message);

  const channels: { key: string; icon: string; label: string; go: () => void; blocked: string | null }[] = [
    {
      key: "whatsapp",
      icon: "chat",
      label: c.inviteChannelWhatsApp,
      // The number goes in the path, so it opens the thread he already has with them.
      go: () => {
        void recordSupplierInvite([supplier.id], "whatsapp");
        window.open(`https://wa.me/${phone.replace(/^\+/, "")}?text=${enc}`, "_blank", "noopener");
      },
      blocked: phone ? null : c.inviteNoPhone,
    },
    {
      key: "email",
      icon: "mail",
      label: c.inviteChannelEmail,
      go: () => {
        // Never awaited: an audit row must not stand between the renter and his mail client.
        void recordSupplierInvite([supplier.id], "email");
        window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(c.inviteSubject)}&body=${enc}`;
      },
      blocked: email ? null : c.inviteNoEmail,
    },
    {
      key: "sms",
      icon: "sms",
      label: c.inviteChannelSms,
      go: () => {
        window.location.href = `sms:${phone}?&body=${enc}`;
      },
      blocked: phone ? null : c.inviteNoPhone,
    },
    {
      key: "copy",
      icon: "content_copy",
      label: c.inviteChannelCopy,
      // Always available: a renter who talks to this supplier somewhere we do not model still gets
      // the words.
      go: () => {
        void copyInvite(message, {
          renterName,
          supplierName: name,
          lang: locale === "ar" ? "ar" : "en",
        }).catch(() => false);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      blocked: null,
    },
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      icon={<Icon name="ios_share" size={18} />}
      title={fmt(c.inviteTitle, { name: supplier.name })}
      subtitle={c.inviteSubtitle}
    >
      <div className="grid gap-3">
        {/* Shown before it is sent, because it goes out under his name. */}
        <p className="whitespace-pre-wrap rounded-md border border-border bg-surface2 px-3 py-2.5 text-meta text-navy">
          {message}
        </p>

        <div className="grid grid-cols-4 gap-2">
          {channels.map((ch) => (
            <button
              key={ch.key}
              type="button"
              disabled={!!ch.blocked}
              title={ch.blocked ?? undefined}
              onClick={ch.go}
              className={cx(
                "flex flex-col items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-3 text-label font-semibold text-navy transition",
                ch.blocked ? "cursor-not-allowed bg-disabled-bg text-disabled-fg" : "hover:bg-surface2",
              )}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-navy-mid">
                <Icon name={ch.key === "copy" && copied ? "check" : ch.icon} size={18} />
              </span>
              {ch.key === "copy" && copied ? c.inviteCopied : ch.label}
            </button>
          ))}
        </div>

        {/* Why the words do not change between channels, and what is missing from the two that are off. */}
        <p className="text-meta text-muted">{c.inviteWhy}</p>
        {channels.some((ch) => ch.blocked) && (
          <p className="flex items-start gap-2 rounded-md bg-surface2 px-3 py-2 text-meta text-muted-dark">
            <Icon name="info" size={15} className="flex-none" />
            {[...new Set(channels.map((ch) => ch.blocked).filter(Boolean))].join(" ")}
          </p>
        )}
        <p className="text-label text-muted-light">{c.inviteRecorded}</p>
      </div>
    </Dialog>
  );
}
