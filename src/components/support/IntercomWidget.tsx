"use client";

/**
 * The Intercom messenger, and its floating launcher.
 *
 * The mobile app deliberately HIDES Intercom's own launcher — it has a `ChatBubble` of its own and
 * two launchers on one screen is one too many. The web has no such bubble, so here the launcher IS
 * the feature: it is the only way a renter reaches support from this app (owner, 2026-08-26).
 *
 * Three states, and the messenger is booted in all of them:
 *
 * 1. **Anonymous** — before the session resolves, and for a visitor who never signs in. A launcher
 *    that only appears once you are signed in is no use to the person most likely to need it.
 * 2. **Identified** — on sign-in, `update` attaches the identity. `user_id` is the database id the
 *    app sends, which is what lets the backend's `conversation.admin.replied` webhook route a
 *    support reply back to this person.
 * 3. **Signed out** — `shutdown` then a fresh anonymous boot. Intercom's documented logout: without
 *    the shutdown the next visitor on a shared machine inherits the conversation.
 *
 * Loaded from an effect rather than `next/script` because the boot has to happen after the session
 * has answered, and the queue stub below means calls made before the script lands are not lost.
 */

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import {
  buildIntercomPayload,
  INTERCOM_API_BASE,
  INTERCOM_APP_ID,
  type IntercomServerIdentity,
} from "@/lib/support/intercom";

type IntercomFn = ((...args: unknown[]) => void) & { q?: unknown[][]; c?: (args: unknown[]) => void };

declare global {
  interface Window {
    Intercom?: IntercomFn;
    intercomSettings?: Record<string, unknown>;
  }
}

/**
 * Intercom's published snippet, typed.
 *
 * The stub matters: it queues every call made before the remote script arrives and the real client
 * drains that queue on load. Without it a boot fired while the session was still resolving would be
 * dropped, and the launcher would sit there anonymous until the next navigation.
 */
function loadIntercom(appId: string): void {
  const w = window;
  if (typeof w.Intercom === "function") {
    w.Intercom("reattach_activator");
    w.Intercom("update", w.intercomSettings);
    return;
  }
  const queue: unknown[][] = [];
  const stub = ((...args: unknown[]) => {
    queue.push(args);
  }) as IntercomFn;
  stub.q = queue;
  stub.c = (args: unknown[]) => {
    queue.push(args);
  };
  w.Intercom = stub;

  const inject = () => {
    const s = document.createElement("script");
    s.type = "text/javascript";
    s.async = true;
    s.src = `https://widget.intercom.io/widget/${appId}`;
    document.head.appendChild(s);
  };
  if (document.readyState === "complete") inject();
  else w.addEventListener("load", inject, false);
}

export function IntercomWidget({ appVersion = "web" }: { appVersion?: string }) {
  const { status, user } = useSession();
  const { locale, dir } = useLocale();
  const booted = useRef(false);
  /** The identity the messenger currently holds, so a re-render does not re-send the same one. */
  const identity = useRef<string | null>(null);
  /**
   * The signature, the real name and the email — everything only the server can answer.
   *
   * Fetched once per signed-in user, then held. Until it lands the messenger stays ANONYMOUS rather
   * than booting on the session alone: an unsigned identified boot is refused outright by a workspace
   * with identity verification switched on, and being briefly anonymous is recoverable where being
   * refused is not. It also spares support a «User 42» contact that a second boot then renames.
   */
  const [server, setServer] = useState<IntercomServerIdentity | null>(null);
  /** Which user `server` describes, so a sign-out or an account switch cannot inherit it. */
  const serverFor = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "authed" || !user) {
      setServer(null);
      serverFor.current = null;
      return;
    }
    if (serverFor.current === user.id) return;
    serverFor.current = user.id;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/support/intercom", { cache: "no-store" });
        if (!res.ok) return; // no identity to add — the anonymous messenger stands
        const data = (await res.json()) as IntercomServerIdentity;
        if (alive && serverFor.current === user.id) setServer(data);
      } catch {
        /* Support must not be the thing that breaks when a fetch does. The launcher stays, anonymous. */
      }
    })();
    return () => {
      alive = false;
    };
  }, [status, user]);

  useEffect(() => {
    if (!INTERCOM_APP_ID) return;
    loadIntercom(INTERCOM_APP_ID);
  }, []);

  useEffect(() => {
    const api = window.Intercom;
    if (!INTERCOM_APP_ID || !api) return;

    /**
     * The launcher follows the writing direction.
     *
     * Bottom-end, not bottom-right: under Arabic every other floating control on this app sits on
     * the left, and a messenger alone on the right reads as something bolted on.
     */
    const base = {
      app_id: INTERCOM_APP_ID,
      api_base: INTERCOM_API_BASE,
      alignment: dir === "rtl" ? "left" : "right",
      language_override: locale,
    };

    // Still asking who this is — boot anonymous rather than waiting. Support is most useful to the
    // person who cannot get in, and that person never reaches `authed`. `server` is part of the test
    // because an identified boot without its signature is refused where verification is on.
    if (status === "loading" || !user || !server) {
      const wanted = "anon";
      if (identity.current === wanted && booted.current) return;
      // A signed-in messenger must be torn down before an anonymous one replaces it, or the previous
      // conversation stays attached to the next person at this browser.
      if (identity.current && identity.current !== "anon") api("shutdown");
      api(booted.current && identity.current === "anon" ? "update" : "boot", base);
      booted.current = true;
      identity.current = wanted;
      return;
    }

    const payload = { ...base, ...buildIntercomPayload({ user, locale, appVersion, server }) };
    // The signature is in the key: a workspace that switches verification on mid-session must
    // re-boot rather than keep an unsigned messenger it will refuse the next call from.
    const wanted = `${user.id}:${user.tier}:${locale}:${server.userHash ?? "unsigned"}`;
    if (identity.current === wanted) return;

    // `boot` the first time this browser meets the user, `update` for anything that changes after —
    // a tier that moved, a language toggled. Booting twice over one identity restarts the session
    // and loses the unread count.
    api(identity.current && identity.current !== "anon" ? "update" : "boot", payload);
    booted.current = true;
    identity.current = wanted;
  }, [status, user, locale, dir, appVersion, server]);

  return null;
}
