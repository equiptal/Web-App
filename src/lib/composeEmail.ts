/**
 * Open a message the renter can send, without depending on a mail app being set up.
 *
 * ── Why not `mailto:` (owner, 2026-09-02) ───────────────────────────────────────────────────────
 *
 * `mailto:` hands the message to whatever the operating system calls the default mail client. On a
 * work laptop with Outlook installed that is fine. On a machine where nobody has configured one — a
 * shared site office, a fresh Windows install, most Macs — pressing it does **nothing at all**, or
 * raises a "choose an app" dialog for apps that are not signed in. The renter presses Send, watches
 * nothing happen, and reasonably concludes the feature is broken.
 *
 * Webmail needs no client and no install: it opens a compose window in the browser he is already in,
 * signed into the account he is already signed into.
 *
 * ── Two of them, because a renter has one (owner, 2026-09-02) ───────────────────────────────────
 *
 * Outlook and Gmail between them cover essentially every business mailbox in this market, and a
 * renter on Gmail handed an Outlook window is in the same position as a renter handed a dead
 * `mailto:` — a compose screen for an account he is not signed into. So he picks, once, and the pick
 * is remembered on this browser.
 *
 * ── It still goes out from HIM ──────────────────────────────────────────────────────────────────
 *
 * Which is the rule this whole feature is built on. Outlook composes it in his own mailbox, under
 * his own address, and it lands in his own sent folder. Nothing here sends on his behalf.
 *
 * ── The recipients go in BCC ────────────────────────────────────────────────────────────────────
 *
 * Forty suppliers in a To line tells each of them exactly who else was asked, which is the renter's
 * commercial business and nobody else's.
 */

/** Where each one composes. Outlook's work host redirects personal accounts to `outlook.live.com`. */
const COMPOSE_URLS = {
  outlook: "https://outlook.office.com/mail/deeplink/compose",
  gmail: "https://mail.google.com/mail/?view=cm&fs=1",
} as const;

export type EmailProvider = keyof typeof COMPOSE_URLS;

export const EMAIL_PROVIDERS: EmailProvider[] = ["outlook", "gmail"];

/** Which browser key remembers the pick. Per browser, never sent anywhere. */
const PROVIDER_KEY = "moeda.emailProvider";

export function loadEmailProvider(): EmailProvider {
  try {
    const v = window.localStorage.getItem(PROVIDER_KEY);
    return v === "gmail" || v === "outlook" ? v : "outlook";
  } catch {
    // Private mode, or storage blocked. A default is a fine answer; a crash is not.
    return "outlook";
  }
}

export function saveEmailProvider(p: EmailProvider): void {
  try {
    window.localStorage.setItem(PROVIDER_KEY, p);
  } catch {
    /* nothing here is worth a broken share */
  }
}

/**
 * Past this, a URL stops being reliable: browsers, and Outlook's own handler, begin truncating —
 * and a truncated body loses its tail, which is where the link is. The caller is told rather than
 * left to send half a message.
 */
export const COMPOSE_URL_MAX = 1900;

export interface Compose {
  /** A named recipient. Used where the message goes to ONE person, like an invitation. */
  to?: string[];
  /** Blind copies. Used where it goes to several, which is every request share. */
  bcc?: string[];
  subject?: string;
  body?: string;
  /** Whose compose window to open. Defaults to Outlook. */
  provider?: EmailProvider;
}

/** The compose URL, or null when it would be too long to survive the trip. */
export function composeEmailUrl({ to = [], bcc = [], subject = "", body = "", provider = "outlook" }: Compose): string | null {
  const gmail = provider === "gmail";
  const q = new URLSearchParams();
  // Gmail takes comma-separated addresses and its own short parameter names; Outlook takes
  // semicolons and the long ones. Handing either the other's spelling silently drops the recipients.
  const join = (list: string[]) => list.join(gmail ? "," : ";");
  if (to.length) q.set("to", join(to));
  if (bcc.length) q.set("bcc", join(bcc));
  if (subject) q.set(gmail ? "su" : "subject", subject);
  if (body) q.set("body", body);
  const base = COMPOSE_URLS[provider];
  const url = `${base}${base.includes("?") ? "&" : "?"}${q.toString()}`;
  return url.length > COMPOSE_URL_MAX ? null : url;
}

/**
 * Open the compose window.
 *
 * A new tab, not this one: the renter is mid-flow on a page that has just posted his request, and
 * navigating away from it would take the link, the confirmation and everything else with it.
 *
 * Returns false when the message was too long to put in a URL, so the caller can offer the fallback
 * it has — copying the addresses, or the message — rather than opening a window with half a body.
 */
export function openEmailCompose(c: Compose): boolean {
  const url = composeEmailUrl(c);
  if (!url) return false;
  window.open(url, "_blank", "noopener");
  return true;
}
