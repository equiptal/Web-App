// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LocaleProvider, useT } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

/**
 * **A locale-prefixed link decides the language** (owner, 2026-09-08: *"fix the /en 404"*).
 *
 * The edge turns `/ar/requests` into `/requests?lang=ar` (`localePrefix` in `middleware.ts`); this is
 * the other half — the provider reading that parameter. Without it the redirect would merely stop
 * 404ing while quietly ignoring the language the URL named, which is worse than the 404: it looks
 * like it worked.
 */

function Probe() {
  const t = useT();
  return (
    <div>
      <span data-testid="back">{t.shell.back}</span>
      <span data-testid="dir">{document.documentElement.dir}</span>
    </div>
  );
}

const at = (search: string) => window.history.replaceState({}, "", `/requests${search}`);
const back = () => screen.getByTestId("back").textContent;

beforeEach(() => {
  window.localStorage.clear();
  at("");
});
afterEach(cleanup);

describe("?lang decides this visit", () => {
  it("renders Arabic for ?lang=ar", async () => {
    at("?lang=ar");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(back()).toBe(ar.shell.back));
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("outranks a stored choice — the link is the more recent instruction", async () => {
    window.localStorage.setItem("moedatech.locale", "en");
    at("?lang=ar");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(back()).toBe(ar.shell.back));
  });

  it("is persisted, so the next page stays in that language", async () => {
    at("?lang=ar");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(window.localStorage.getItem("moedatech.locale")).toBe("ar"));
  });

  it("is stripped from the URL, and nothing else is", async () => {
    // Left in place it rides into every link he copies, and it would beat the language switcher on
    // the next reload — pressing «عربي» and having the page revert is that bug.
    at("?r=abc&lang=ar&tab=compare");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(window.location.search).not.toContain("lang"));
    expect(window.location.search).toContain("r=abc");
    expect(window.location.search).toContain("tab=compare");
    expect(window.location.pathname).toBe("/requests");
  });

  it("ignores a language it does not have", async () => {
    at("?lang=fr");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(back()).toBe(en.shell.back));
    // Not ours to strip: it belongs to whoever put it there.
    expect(window.location.search).toContain("lang=fr");
  });

  it("keeps a stored choice when the URL says nothing", async () => {
    window.localStorage.setItem("moedatech.locale", "ar");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(back()).toBe(ar.shell.back));
  });
});
