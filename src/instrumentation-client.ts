import posthog from "posthog-js";
import { POSTHOG_KEY } from "@/lib/analytics";

/**
 * **PostHog, started once in the browser before the app hydrates** (2026-10-21). Next 15.3+ runs
 * this file on its own; PostHog's Next.js guide recommends it over a provider.
 *
 * Captures every page: `$pageview` on each route change (the web has real URLs, unlike Supplier
 * OS), page leaves, autocaptured clicks, inputs and submits, uncaught errors (`$exception`),
 * `$rageclick` and `$dead_click`. Who the events belong to is set by `PostHogIdentity`, from the
 * session.
 *
 * ⚠️ **Same PostHog project as the mobile app and Supplier OS.** Every event here carries
 * `product: "web_app"` (registered below); OS events carry `product: "os"`, and the app's have
 * `$lib: "posthog-flutter"`. `$lib` alone cannot split the two websites: both are `web`.
 *
 * ⚠️ **`/api/ingest` is a reverse proxy, not a route** (`next.config.ts` rewrites): ad blockers
 * drop requests to `*.posthog.com`, which shows as low numbers with no error anywhere. Under
 * `/api` because the middleware matcher skips `/api`.
 *
 * ⚠️ **Session recording is on with NOTHING masked**, by owner decision (2026-10-21), the same as
 * the app and Supplier OS. Typed values, prices and documents are stored in PostHog; password
 * fields stay masked because the SDK forces it.
 */
if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: "/api/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    session_recording: { maskAllInputs: false },
    capture_exceptions: true,
    capture_dead_clicks: true,
  });
  posthog.register({ product: "web_app" });
}
