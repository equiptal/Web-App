/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   STAGING BRANCH ONLY — DO NOT MERGE TO main.

   This is a developer instrument, not part of the product. It lives on `staging` so the UI can be
   read off by number while it is being restyled, and it is meant to stay there: keep it out of any
   PR that targets main, and drop it from a release branch if it ever rides along.

   The host allowlist in `uiPinsAllowed()` is the belt to this brace — if the file does reach
   production by accident, the overlay still renders nothing on the production host. Neither
   protection replaces the other.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * UI pins — a fixed number for every surface in the app, so a restyle can be asked for by number.
 *
 * "Move the padding on #26" is unambiguous in a way that "the requests rail" is not: this file is the
 * one place that says which component #26 is and which file it lives in. The number is written down
 * here rather than counted at runtime, because a number that depends on DOM order changes when the
 * page changes, and then yesterday's note points at a different component.
 *
 * ── How a component gets its pin ────────────────────────────────────────────────────────────────
 * Add an entry below, then spread `pin("<id>")` onto that component's ROOT element:
 *
 *     export function RequestRail() {
 *       return <aside {...pin("request-rail")} className={...}>…</aside>;
 *     }
 *
 * That writes `data-pin="26"` into the markup. The attribute ships in every environment — it is four
 * bytes and no behaviour — and the OVERLAY is the part that is gated, by host (see `uiPinsAllowed`),
 * so there is nothing to conditionally render and no hydration mismatch to chase.
 *
 * ── A pin can name a PART, not just a component ─────────────────────────────────────────────────
 * A component number is often too coarse to act on: "#17" is the whole machine card, but the change
 * is usually to its head row or its quantity control alone. So a pin number may carry a second
 * segment — `17.3` is the third named part of #17 — and the overlay draws both, with a depth filter
 * for when the detail is in the way.
 *
 * Two levels is the working limit. Past that you are describing the DOM rather than the design, and
 * a third number is harder to say than the class it would have pointed at.
 *
 * ── The numbers are blocked by area, with gaps ──────────────────────────────────────────────────
 *   1–9    chrome (shell, header, nav, page frame)
 *   10–14  home
 *   15–24  create
 *   25–44  requests + workspace
 *   45–59  map, compare, deal room
 *   60–69  inbox, stores
 *   70–89  profile, company, auth, onboarding
 *   90–99  primitives
 *
 * The gaps are deliberate: a new panel in `create` takes the next free number in 15–24 and every
 * other number stays where it was. **Never renumber an existing entry** — old notes, screenshots and
 * tickets refer to it. Retire one by deleting the entry and leaving its number unused.
 *
 * ── What has no pin, and why ────────────────────────────────────────────────────────────────────
 * A component whose root is a FRAGMENT cannot carry one — there is no element to hang the attribute
 * on, and wrapping it in a div would change the layout the pin exists to inspect. `ChatDock`,
 * `EquipmentList` and `CreateSurface` are in that state; pin a real child of theirs when one is
 * worth naming. The `/requests` list, detail and compare modules are line-commented out entirely
 * (see docs/requests-workspace-disabled.md), so they are left out until they come back.
 */

/**
 * The hosts where the pin overlay may be switched on.
 *
 * An ALLOWLIST, not a check for production: a new domain — a preview branch, a second prod host, a
 * marketing mirror — arrives with pins off and has to be named here to get them, which is the safe
 * direction to be wrong in. Production (`web.moedatech.net`) is simply absent.
 *
 * Read from `window.location` rather than an env var, because this needs no per-branch setting in
 * the Amplify console: one build behaves correctly on every host it is served from.
 */
const PIN_HOSTS = ["webstaging.moedatech.net", "localhost", "127.0.0.1"];

/** Whether this browser, on this host, may show the overlay. Client-only — the server never can. */
export function uiPinsAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  // Amplify branch previews get a generated `*.amplifyapp.com` host; those are staging by definition.
  return PIN_HOSTS.includes(host) || host.endsWith(".amplifyapp.com");
}

export type PinEntry = { n: string; label: string; file: string };

export const PIN_REGISTRY = {
  /* ── 1–9  chrome ──────────────────────────────────────────────────────────────────────────── */
  "app-shell": { n: "1", label: "App frame", file: "src/components/AppShell.tsx" },
  "app-header": { n: "2", label: "Header bar (navy)", file: "src/components/AppShell.tsx" },
  "header-logo": { n: "2.1", label: "Header — logo", file: "src/components/AppShell.tsx" },
  "header-nav-slot": { n: "2.2", label: "Header — centred nav slot", file: "src/components/AppShell.tsx" },
  "app-nav": { n: "3", label: "Nav tabs — desktop", file: "src/components/AppNav.tsx" },
  "nav-tab": { n: "3.1", label: "Nav tab — one link", file: "src/components/AppNav.tsx" },
  "app-nav-mobile": { n: "4", label: "Nav tabs — mobile", file: "src/components/AppNav.tsx" },
  "header-account": { n: "5", label: "Account menu + locale toggle", file: "src/components/AppShell.tsx" },
  "header-locale": { n: "5.1", label: "Header — EN/AR toggle", file: "src/components/AppShell.tsx" },
  "header-icons": { n: "5.2", label: "Header — inbox + bell pair", file: "src/components/AppShell.tsx" },
  "header-avatar": { n: "5.3", label: "Header — avatar", file: "src/components/AppShell.tsx" },
  "notifications-bell": { n: "6", label: "Notifications bell", file: "src/components/NotificationsBell.tsx" },
  "page-main": { n: "7", label: "Page body (gutters live here)", file: "src/components/AppShell.tsx" },
  "page-back": { n: "8", label: "Back arrow", file: "src/components/AppShell.tsx" },
  "page-section": { n: "9", label: "Page section", file: "src/components/PageSection.tsx" },

  /* ── 10–14  home ──────────────────────────────────────────────────────────────────────────── */
  "home-hub": { n: "10", label: "Home", file: "src/components/home/HomeHub.tsx" },
  "browse-page": { n: "10.5", label: "Browse — banner + supplier directory", file: "src/components/stores/BrowsePage.tsx" },
  "home-hero": { n: "10.1", label: "Home — hero band", file: "src/components/home/HomeHub.tsx" },
  "home-hero-actions": { n: "10.2", label: "Home — hero action column", file: "src/components/home/HomeHub.tsx" },
  "home-requests": { n: "10.4", label: "Home — requests + bids rail", file: "src/components/home/HomeRequests.tsx" },
  "suppliers-list": { n: "10.6", label: "My Suppliers — the list", file: "src/components/suppliers/SuppliersPage.tsx" },
  "start-request-modal": { n: "11", label: "Start-your-request modal", file: "src/components/home/StartYourRequestModal.tsx" },

  /* ── 15–24  create ────────────────────────────────────────────────────────────────────────── */
  "create-intake": { n: "15", label: "Create — intake screen", file: "src/components/screens/Intake.tsx" },
  "create-canvas": { n: "16", label: "Create canvas (3 columns)", file: "src/components/create/Canvas.tsx" },
  "machine-card": { n: "17", label: "Machine card", file: "src/components/create/MachineCard.tsx" },
  "machine-card-head": { n: "17.1", label: "Machine card — head row", file: "src/components/create/MachineCard.tsx" },
  "machine-card-body": { n: "17.2", label: "Machine card — body grid", file: "src/components/create/MachineCard.tsx" },
  "machine-card-image": { n: "17.3", label: "Machine card — image well", file: "src/components/create/MachineCard.tsx" },
  "operator-rail": { n: "18", label: "Operator rail", file: "src/components/create/OperatorRail.tsx" },
  "operator-rail-head": { n: "18.1", label: "Operator rail — head row", file: "src/components/create/OperatorRail.tsx" },
  "operator-rail-options": { n: "18.2", label: "Operator rail — options grid", file: "src/components/create/OperatorRail.tsx" },
  "operator-rail-note": { n: "18.3", label: "Operator rail — note block", file: "src/components/create/OperatorRail.tsx" },
  "when-panel": { n: "19", label: "When panel (dates)", file: "src/components/create/WhenPanel.tsx" },
  "when-panel-head": { n: "19.1", label: "When panel — head button", file: "src/components/create/WhenPanel.tsx" },
  "when-panel-body": { n: "19.2", label: "When panel — open body", file: "src/components/create/WhenPanel.tsx" },
  "where-panel": { n: "20", label: "Where panel (site)", file: "src/components/create/WherePanel.tsx" },
  "where-panel-head": { n: "20.1", label: "Where panel — head button", file: "src/components/create/WherePanel.tsx" },
  "where-panel-body": { n: "20.2", label: "Where panel — open body", file: "src/components/create/WherePanel.tsx" },
  "ready-to-send": { n: "21", label: "Ready-to-send bar", file: "src/components/create/ReadyToSend.tsx" },
  "carry-forward-modal": { n: "23", label: "Carry-forward modal", file: "src/components/create/CarryForwardModal.tsx" },
  "create-processing": { n: "24", label: "Create — processing screen", file: "src/components/screens/Processing.tsx" },
  "create-confirmation": { n: "22", label: "Create — confirmation screen", file: "src/components/screens/Confirmation.tsx" },

  /* ── 25–44  requests + workspace ──────────────────────────────────────────────────────────── */
  "requests-workspace": { n: "25", label: "Requests workspace", file: "src/components/workspace/RequestsWorkspace.tsx" },
  "request-rail": { n: "26", label: "Requests rail (full-bleed band)", file: "src/components/workspace/RequestRail.tsx" },
  "rail-create-tile": { n: "26.1", label: "Rail — create tile", file: "src/components/workspace/RequestRail.tsx" },
  "rail-tiles": { n: "26.2", label: "Rail — request tiles", file: "src/components/workspace/RequestRail.tsx" },
  // 27 was the request strip, a full-width band above the tabs. It is the context bar now — the
  // location and the item, and the item switcher the strip used to carry as chips (owner, 2026-08-27).
  "item-tier": { n: "26.3", label: "Item tier — one chip per machine", file: "src/components/workspace/ItemTier.tsx" },
  "request-context": { n: "27", label: "Request context bar (location + item)", file: "src/components/workspace/RequestContextBar.tsx" },
  "request-details": { n: "28", label: "Request details modal", file: "src/components/workspace/RequestDetailsModal.tsx" },
  "workspace-bid-cards": { n: "29", label: "Bid cards", file: "src/components/workspace/BidCards.tsx" },
  "bid-card": { n: "29.1", label: "Bid card — one tile", file: "src/components/workspace/BidCards.tsx" },
  "bid-card-header": { n: "29.2", label: "Bid card — header", file: "src/components/workspace/BidCards.tsx" },
  "bid-card-footer": { n: "29.3", label: "Bid card — bottom row", file: "src/components/workspace/BidCards.tsx" },
  "compare-matrix": { n: "30", label: "Compare matrix", file: "src/components/workspace/CompareMatrix.tsx" },
  "matrix-scroller": { n: "30.1", label: "Matrix — horizontal scroller", file: "src/components/workspace/CompareMatrix.tsx" },
  "matrix-supplier-col": { n: "30.2", label: "Matrix — supplier column", file: "src/components/workspace/CompareMatrix.tsx" },
  "terms-panel": { n: "36", label: "Terms panel", file: "src/components/requests/TermsPanel.tsx" },
  "bid-readiness": { n: "37", label: "Bid readiness", file: "src/components/requests/BidReadiness.tsx" },
  "share-for-bids": { n: "38", label: "Share-for-bids sheet", file: "src/components/requests/ShareForBidsSheet.tsx" },

  /* ── 45–59  map, compare, deal room ───────────────────────────────────────────────────────── */
  "bid-map-workspace": { n: "45", label: "Bid map workspace", file: "src/components/map/BidMapWorkspace.tsx" },
  "bidmap-canvas": { n: "45.1", label: "Bid map — canvas side", file: "src/components/map/BidMapWorkspace.tsx" },
  "bidmap-panel": { n: "45.2", label: "Bid map — side panel", file: "src/components/map/BidMapWorkspace.tsx" },
  "map-canvas": { n: "46", label: "Map canvas", file: "src/components/map/MapCanvas.tsx" },
  "price-footer": { n: "48", label: "Price footer", file: "src/components/map/PriceFooter.tsx" },
  "map-request-card": { n: "49", label: "Map request card", file: "src/components/map/RequestCard.tsx" },
  "company-panel": { n: "51", label: "Supplier panel", file: "src/components/map/panel/CompanyPanel.tsx" },
  "equipment-detail": { n: "52", label: "Equipment detail panel", file: "src/components/map/panel/EquipmentDetail.tsx" },
  "deal-room": { n: "55", label: "Deal room", file: "src/components/deal-room/DealRoom.tsx" },
  "chat-card": { n: "56", label: "Chat card", file: "src/components/deal-room/ChatCard.tsx" },

  /* ── 60–69  inbox, stores ─────────────────────────────────────────────────────────────────── */
  "inbox-view": { n: "60", label: "Inbox", file: "src/components/inbox/InboxView.tsx" },
  "browse-surface": { n: "61", label: "Browse stores", file: "src/components/stores/BrowseSurface.tsx" },
  "store-detail": { n: "62", label: "Store detail", file: "src/components/stores/StoreDetailSurface.tsx" },
  "store-card": { n: "63", label: "Store card", file: "src/components/stores/StoreCard.tsx" },

  /* ── 70–89  profile, company, auth, onboarding ────────────────────────────────────────────── */
  "profile-view": { n: "70", label: "Profile", file: "src/components/profile/ProfileView.tsx" },
  "edit-profile-form": { n: "71", label: "Edit profile form", file: "src/components/profile/EditProfileForm.tsx" },
  "company-hub": { n: "72", label: "Company hub", file: "src/components/company/CompanyHub.tsx" },
  "my-company-card": { n: "74", label: "My company card", file: "src/components/company/MyCompanyCard.tsx" },
  "onboarding-shell": { n: "75", label: "Onboarding shell", file: "src/components/onboarding/OnboardingShell.tsx" },
  "onboarding-form": { n: "76", label: "Onboarding form", file: "src/components/onboarding/OnboardingForm.tsx" },
  "verification-flow": { n: "77", label: "Verification flow", file: "src/components/onboarding/VerificationFlow.tsx" },
  "auth-gate": { n: "78", label: "Sign-in / register modal", file: "src/components/onboarding/AccountModal.tsx" },
  "sign-in-prompt": { n: "79", label: "Sign-in prompt", file: "src/components/common/SignInPrompt.tsx" },

  /* ── 90–99  primitives ────────────────────────────────────────────────────────────────────── */
  "dialog": { n: "90", label: "Dialog", file: "src/components/Dialog.tsx" },
  "dialog-panel": { n: "90.1", label: "Dialog — panel", file: "src/components/Dialog.tsx" },
  "dialog-header": { n: "90.2", label: "Dialog — header row", file: "src/components/Dialog.tsx" },
  "search-select": { n: "92", label: "Search select", file: "src/components/create/SearchSelect.tsx" },
} as const satisfies Record<string, PinEntry>;

export type PinId = keyof typeof PIN_REGISTRY;

/**
 * Props to spread onto a component's root element. Always returns the attribute — see the note at
 * the top about why this is not gated.
 */
export function pin(id: PinId): { "data-pin": string } {
  return { "data-pin": PIN_REGISTRY[id].n };
}

/** Reverse lookup used by the overlay to label a number it found in the DOM. */
export const PIN_BY_NUMBER: ReadonlyMap<string, PinEntry & { id: string }> = new Map(
  Object.entries(PIN_REGISTRY).map(([id, entry]) => [entry.n, { ...entry, id }]),
);

/**
 * Sort key for a pin number: "17.10" must come after "17.9", which string order gets wrong and a
 * float parse gets wrong differently. Compare segment by segment as integers.
 */
export function pinOrder(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** How deep a pin sits: "17" is 1, "17.3" is 2. Used by the overlay depth filter. */
export function pinDepth(n: string): number {
  return n.split(".").length;
}
