/**
 * Shared test setup. Runs for BOTH environments, so everything here has to be safe in node too —
 * the node half of the suite is the majority and must not start depending on a DOM by accident.
 */

import { afterEach, vi } from "vitest";

/**
 * The App Router is a runtime, not a module — `useRouter` throws "expected app router to be mounted"
 * outside a Next render. Components under test call it for navigation they do not own (a verify
 * prompt, a redirect home), so the stub records the calls and lets the component render.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/create",
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

const hasDom = typeof window !== "undefined" && typeof document !== "undefined";

if (hasDom) {
  // React Testing Library's auto-cleanup only registers when it detects a global `afterEach`, which
  // it does — but registering it explicitly keeps the behaviour independent of that detection.
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    // Each test starts from an empty draft: the store persists to localStorage on every change, and a
    // leaked draft would rehydrate into the next test as a continue/start-over prompt.
    try {
      window.localStorage.clear();
    } catch {
      /* storage unavailable — nothing to clear */
    }
  });

  // jsdom implements neither of these, and the canvas uses both: `matchMedia` for the
  // reduced-motion query behind the shake, `scrollTo` when a panel changes.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!window.scrollTo) {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
  }
  // jsdom has no layout, so it implements no scrolling at all — `scrollIntoView` is simply absent and
  // calling it throws. The canvas uses it to bring a refused move's shake on screen, so without this
  // the shake tests fail for a reason that has nothing to do with the shake.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
}
