// @vitest-environment jsdom
// The sanitiser parses with `DOMParser`, so it needs a window even though it renders nothing.
import { describe, it, expect } from "vitest";
import { looksLikeHtml, sanitizeLegalHtml } from "@/lib/contract/legal-html";

/**
 * The legal documents, rendered rather than printed (owner, 2026-09-07: *"privacy policy and terms of
 * use are showing plain html — what is this issue!!"*).
 *
 * `GET /app/content/{key}` returns authored HTML, and the mobile app has always rendered it
 * (`legal_content_page.dart` → `HtmlWidget`). The web printed the markup as text. These pin the two
 * halves of the fix: what survives the allow-list, and what a document made of plain paragraphs does.
 */

describe("what a legal document may contain", () => {
  it("keeps the vocabulary a document is written in", () => {
    const out = sanitizeLegalHtml("<h2>Scope</h2><p>These <strong>terms</strong> apply.</p><ul><li>One</li></ul>");
    expect(out).toContain("<h2>Scope</h2>");
    expect(out).toContain("<strong>terms</strong>");
    expect(out).toContain("<li>One</li>");
  });

  it("drops a script and its contents, not just its tags", () => {
    // The text of a script is code; unwrapping it would print the code as prose.
    const out = sanitizeLegalHtml('<p>Before</p><script>alert("x")</script><p>After</p>');
    expect(out).not.toContain("alert");
    expect(out).toContain("<p>Before</p>");
    expect(out).toContain("<p>After</p>");
  });

  it("unwraps a tag it does not know, keeping what that tag said", () => {
    // A document that grows a table must still read as sentences rather than vanish.
    const out = sanitizeLegalHtml("<table><tr><td>Cell text</td></tr></table>");
    expect(out).not.toContain("<table");
    expect(out).toContain("Cell text");
  });

  it("strips every event handler", () => {
    const out = sanitizeLegalHtml('<p onclick="steal()">Read me</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("Read me");
  });

  it("refuses a javascript: link and keeps a real one", () => {
    expect(sanitizeLegalHtml('<a href="javascript:alert(1)">Tap</a>')).not.toContain("javascript:");
    const ok = sanitizeLegalHtml('<a href="https://moedatech.net/privacy">Policy</a>');
    expect(ok).toContain('href="https://moedatech.net/privacy"');
    // Out of the app, in its own tab, with no handle back to ours.
    expect(ok).toContain('target="_blank"');
    expect(ok).toContain("noopener");
  });

  it("keeps a mailto and an in-app path, which a policy legitimately carries", () => {
    expect(sanitizeLegalHtml('<a href="mailto:legal@moedatech.net">Write</a>')).toContain("mailto:");
    expect(sanitizeLegalHtml('<a href="/legal/terms-of-use">Terms</a>')).toContain('href="/legal/terms-of-use"');
  });
});

describe("telling a document from a paragraph", () => {
  it("recognises markup", () => {
    expect(looksLikeHtml("<p>Hello</p>")).toBe(true);
    expect(looksLikeHtml("<h2>Scope</h2>")).toBe(true);
  });

  it("leaves plain text alone, so its line breaks survive", () => {
    // A document stored as paragraphs is printed as text — `whitespace-pre-wrap` is what keeps it
    // readable, and running it through the renderer would collapse every break.
    expect(looksLikeHtml("Section 1.\n\nWe collect your phone number.")).toBe(false);
    expect(looksLikeHtml("Terms & conditions — 2026")).toBe(false);
  });
});
