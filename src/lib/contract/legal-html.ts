/**
 * The legal documents arrive as HTML, and this decides what of it may be drawn.
 *
 * ── The bug (owner, 2026-09-07: *"privacy policy and terms of use are showing plain html"*) ──────
 * `GET /app/content/{key}` returns an admin-authored document with `<h2>`, `<p>`, `<ul>` in it. The
 * web printed that string as TEXT, so a renter opening the terms read the markup. The mobile app has
 * always rendered it — `legal_content_page.dart` hands the same field to `HtmlWidget` and styles
 * `h1`/`h2`/`h3`, `p`/`li`/`span` and `a`. This is the web's half of that.
 *
 * ── Why sanitise a document we author ourselves ──────────────────────────────────────────────────
 * Because "we author it" is a fact about today's process, not a property of the endpoint. The string
 * reaches the page from a network read and is inserted with `dangerouslySetInnerHTML`; an allow-list
 * costs forty lines and removes the whole class of question. Anything not named below is dropped and
 * its TEXT is kept, so a document that grows a `<table>` still reads as sentences rather than
 * vanishing.
 *
 * ⚠️ **No dependency.** DOMPurify would be the ordinary answer and it is a 20 KB dependency for one
 * page; this list is small because the vocabulary of a legal document is small. If a third surface
 * ever needs to render authored HTML, that is the moment to reach for the library instead.
 */

/** Tags a legal document may use. Everything else is unwrapped to its text. */
const ALLOWED = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "small",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "a", "span", "div", "section", "blockquote", "hr",
]);

/** Attributes that survive, per tag. Everything else — including every `on*` handler — is dropped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
};

/** `javascript:` and `data:` are the two an href must never carry. */
function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(v)) return v;
  return null;
}

/**
 * Whether a string looks like markup at all.
 *
 * A document stored as plain paragraphs must keep its line breaks, and running it through the
 * renderer would collapse them — so the page asks this first and prints text as text.
 */
export function looksLikeHtml(s: string): boolean {
  return /<(p|div|h[1-4]|ul|ol|li|br|strong|em|span|section|a)\b[^>]*>/i.test(s);
}

/**
 * The document, reduced to the tags above.
 *
 * Browser-only: it parses with `DOMParser`, which is the one parser guaranteed to read the markup the
 * way the renderer will. On the server it returns the text with its tags stripped, which is what SSR
 * should paint anyway — the page hydrates and re-renders the full document a tick later.
 */
export function sanitizeLegalHtml(raw: string): string {
  if (!raw) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return raw.replace(/<[^>]*>/g, "");
  }
  const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, "text/html");

  const clean = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) return [node.cloneNode()];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const kids = [...el.childNodes].flatMap(clean);

    // `script` and `style` lose their CONTENT as well — their text is code, not prose.
    if (tag === "script" || tag === "style") return [];
    if (!ALLOWED.has(tag)) return kids; // unwrap: keep what it said, drop what it was

    const out = doc.createElement(tag);
    const allowed = ALLOWED_ATTRS[tag];
    if (allowed) {
      for (const attr of [...el.attributes]) {
        if (!allowed.has(attr.name.toLowerCase())) continue;
        if (attr.name.toLowerCase() === "href") {
          const href = safeHref(attr.value);
          if (href) out.setAttribute("href", href);
          continue;
        }
        out.setAttribute(attr.name, attr.value);
      }
      // A link out of the app opens in its own tab, and never with a window handle back to ours.
      if (tag === "a" && out.getAttribute("href")?.startsWith("http")) {
        out.setAttribute("target", "_blank");
        out.setAttribute("rel", "noopener noreferrer");
      }
    }
    for (const kid of kids) out.appendChild(kid);
    return [out];
  };

  const body = doc.body;
  const cleaned = [...body.childNodes].flatMap(clean);
  const wrapper = doc.createElement("div");
  for (const n of cleaned) wrapper.appendChild(n);
  return wrapper.innerHTML;
}
