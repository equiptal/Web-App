import posthog from "posthog-js";

/**
 * **PostHog for the web** (2026-10-21). One named event from a client component.
 *
 * ⚠️ **Event names and property keys copy the mobile app's on purpose** (`apps/mobile` in
 * Moedatech-App, the reference for shared logic). One funnel such as
 * `request_started → request_submitted` then covers the app and the web; tell them apart by
 * `product` (`web_app` here, registered in `src/instrumentation-client.ts`; `os` from Supplier
 * OS) or `$lib` (`posthog-flutter` for the app). Renaming one here splits that funnel silently.
 *
 * A no-op when `NEXT_PUBLIC_POSTHOG_KEY` is unset (local, staging), so callers never check it.
 * The key is inlined at BUILD time: the Dockerfile and `amplify.yml` both pass it through.
 */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || null;

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}
