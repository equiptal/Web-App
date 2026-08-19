// Decode the v3 prototype.
//
// The file nests TWICE, which is what design-v3.md's "escaped JS string" is describing:
//   outer .html  →  <script> "…escaped inner document…" </script>
//   inner doc    →  <script type="text/x-dc"> …the app source… </script>  +  a final <style>
//
// `lastIndexOf("<script")` on the outer file lands on the ESCAPED inner tag (char 4,633,423 — the
// offset design-v3.md records), not on the outer one. So find the outer script by the shape of its
// body: a tag whose first non-space content character is a real `"`.
const fs = require("fs");
const SRC = "C:/Users/yaraf/Downloads/Deal Room Map.html";
const D = __dirname;

const html = fs.readFileSync(SRC, "utf8");

let openQuote = -1;
for (let i = html.indexOf("<script"); i !== -1; i = html.indexOf("<script", i + 1)) {
  const gt = html.indexOf(">", i);
  if (gt === -1) continue;
  let j = gt + 1;
  while (j < html.length && /\s/.test(html[j])) j++;
  if (html[j] === '"') { openQuote = j; break; }   // the escaped inner tags show `\"` here
}
if (openQuote === -1) throw new Error("outer literal not found");

const closeScript = html.lastIndexOf("</script>");
const closeQuote = html.lastIndexOf('"', closeScript);
const inner = JSON.parse(html.slice(openQuote, closeQuote + 1));
fs.writeFileSync(D + "/inner.html", inner, "utf8");
console.log("inner document chars:", inner.length);

// The app source — the inner document's `text/x-dc` script.
const appTag = inner.lastIndexOf("<script");
const app = inner.slice(inner.indexOf(">", appTag) + 1, inner.lastIndexOf("</script>"));
fs.writeFileSync(D + "/app.txt", app, "utf8");
console.log("app chars:", app.length, "(design-v3 says 423,886)");
console.log("app lines:", app.split("\n").length, "(design-v3 says 4,482)");

// The static CSS — every @keyframes plus the interaction language — lives in the inner doc's LAST
// <style>, separate from the app string.
const st = inner.lastIndexOf("<style");
const css = inner.slice(inner.indexOf(">", st) + 1, inner.indexOf("</style>", st));
fs.writeFileSync(D + "/app.css", css, "utf8");
console.log("css chars:", css.length);
