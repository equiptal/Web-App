/**
 * What the upload check reads, made in the BROWSER: the fingerprint of a file and its JPEG copies
 * (company doc check CC-12, Moedatech `contract-v4.md` §1 «Copies»).
 *
 * Ported from the Supplier OS (`lib/documents/sha256.ts`, `lib/documents/scan-thumbnail.ts`
 * `checkCopyPages`), so the two web clients send the worker the same pixels for the same file.
 *
 * ⚠️ **Copies go browser → S3** through the presigned links the check answered. No file byte
 * passes through this app's server.
 *
 * ⚠️ **Every failure is «not looked at», never a blank.** An empty `pages` (or a `null` slot) is a
 * copy that never arrives, which the worker saves as unread: the honest answer (R2).
 *
 * Browser only (`crypto.subtle`, canvas, `createImageBitmap`, pdfjs); imported by the client hook.
 */

/**
 * SHA-256 of a file's bytes, as hex: the EXACT bytes the pile upload PUTs (the same `File`), which
 * is what the known-files memory keys on. `crypto.subtle` exists only over HTTPS and on localhost,
 * so this can fail; the session then never sends that file to the check.
 */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The OS's quality ladder: stepped down until a copy fits its byte cap. */
const JPEG_QUALITY_LADDER = [0.62, 0.52, 0.44, 0.4] as const;

/** Longest edge → `edge`, never scaling a small image UP. */
function fitScale(width: number, height: number, edge: number): number {
  const longest = Math.max(width, height);
  return longest > edge ? edge / longest : 1;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/**
 * The canvas as a JPEG within `maxBytes`, or null when even the last rung is over (the worker
 * would not read it anyway: a small copy over its cap makes the file unreadable).
 */
async function encodeWithin(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob | null> {
  for (const q of JPEG_QUALITY_LADDER) {
    const blob = await toJpeg(canvas, q);
    if (blob && blob.size > 0 && blob.size <= maxBytes) return blob;
  }
  return null;
}

/**
 * A blank canvas of the page's size, painted white: a JPEG has no alpha, so a transparent PNG or a
 * PDF page (which paints no background) would otherwise encode as black.
 */
function whiteCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function imageCopy(file: File, edge: number, maxBytes: number): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = fitScale(bitmap.width, bitmap.height, edge);
    const drawn = whiteCanvas(bitmap.width * scale, bitmap.height * scale);
    if (!drawn) return null;
    drawn.ctx.drawImage(bitmap, 0, 0, drawn.canvas.width, drawn.canvas.height);
    return await encodeWithin(drawn.canvas, maxBytes);
  } finally {
    bitmap.close();
  }
}

/**
 * One copy per PDF page, up to `maxPages`, and the document's REAL page count (the check is told
 * how long the file is; it reads the first `maxPdfPages` and lists a longer one as `too_long`).
 *
 * ⚠️ **Slot k is page k**: a page that fails to draw keeps its slot as `null`, because the
 * server's upload links are indexed by page.
 *
 * ⚠️ **The LEGACY build, imported dynamically**: the modern one uses top-level await, which Next
 * refuses, and pdfjs must never load on the server. The worker is pointed at the BUNDLED asset (an
 * empty `workerSrc` makes pdfjs fetch a «fake worker» module no bundler emitted; the OS records it).
 */
async function pdfCopies(
  file: File,
  edge: number,
  maxBytes: number,
  maxPages: number,
  onPageCount: (n: number) => void,
): Promise<Array<Blob | null>> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    onPageCount(Math.max(1, pdf.numPages));
    const out: Array<Blob | null> = [];
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n += 1) {
      try {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: fitScale(base.width, base.height, edge) });
        const drawn = whiteCanvas(viewport.width, viewport.height);
        if (!drawn) {
          out.push(null);
          continue;
        }
        await page.render({ canvas: drawn.canvas, canvasContext: drawn.ctx, viewport }).promise;
        out.push(await encodeWithin(drawn.canvas, maxBytes));
        // Freed now, not at GC: Safari keeps a canvas's backing store until it runs.
        drawn.canvas.width = 0;
        drawn.canvas.height = 0;
      } catch {
        out.push(null);
      }
    }
    return out;
  } finally {
    void task.destroy();
  }
}

/**
 * The copies the check reads: JPEG, longest edge at most `edge`, within `maxBytes`, one per PDF
 * page up to `maxPages`. Never throws: a file that cannot be drawn is `{ pages: [] }`.
 */
export async function checkCopyPages(
  file: File,
  o: { edge: number; maxBytes: number; maxPages: number },
): Promise<{ pages: Array<Blob | null>; pageCount: number }> {
  let pageCount = 1;
  try {
    if (file.type === "application/pdf") {
      const pages = await pdfCopies(file, o.edge, o.maxBytes, o.maxPages, (n) => {
        pageCount = n;
      });
      return { pages, pageCount };
    }
    if (!file.type.startsWith("image/")) return { pages: [], pageCount };
    return { pages: [await imageCopy(file, o.edge, o.maxBytes)], pageCount };
  } catch {
    return { pages: [], pageCount };
  }
}
