"use client";

/**
 * **Saving a batch of presigned documents** — the browser half of the panel's «تنزيل».
 *
 * Split out of `CompanyPanel` on 2026-08-08, when the equipment tab grew a download batch of its own
 * (owner's UI design: one checkbox column, and a tick on a **held** row means *save this*). Two
 * components now run the same batch, and the alternative to a shared module was the equipment tab
 * importing a component file for its helpers — which would pull the whole company panel into its module
 * graph for the sake of three functions.
 *
 * **What is here is only what touches the DOM.** *Which* files a run covers is the model's
 * (`docDownloadBatch` / `companyDownloadBatch`), so it stays testable in this repo's `node` vitest env;
 * this file fetches, names and saves them.
 */

import { useCallback, useState } from "react";
import type { DocDownloadTarget } from "./machine-panel-model";

/**
 * What the saved file is called. The presigned key is a uuid, so a batch of five would land as five
 * unreadable names; the row's own label is what the renter just read on screen.
 *
 * The extension is copied off the url's path when it looks like one, and omitted otherwise — a wrong
 * extension is worse than none, because it makes the operating system open the file with the wrong app.
 */
export function downloadFileName(label: string, url: string): string {
  let ext = "";
  try {
    const path = new URL(url, "https://x.invalid").pathname;
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    if (m) ext = `.${m[1].toLowerCase()}`;
  } catch {
    /* an unparseable url still downloads; it just gets no extension */
  }
  // Anything a file system would read as a path separator, and the characters Windows refuses.
  const safe = label.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "document";
  return `${safe}${ext}`;
}

/**
 * Save one presigned file without navigating and without opening a tab.
 *
 * `<a download href={presignedUrl}>` will not do: the bucket is cross-origin and the objects are not
 * signed with an attachment disposition, so the browser ignores `download` and **navigates the panel
 * away**. Fetching to a blob and pointing the anchor at an object url keeps the download same-origin
 * from the browser's point of view, which is what makes `download` binding.
 *
 * Depends on the bucket answering the app's origin with CORS headers. When it does not, the fetch
 * rejects — which is why the caller counts failures and says so, instead of leaving the renter to guess.
 */
async function saveOne(target: DocDownloadTarget, name: string): Promise<void> {
  const res = await fetch(target.url, { credentials: "omit", mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: Safari and Firefox still need the object url alive when the save actually starts.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Run the batch **one file at a time**, reporting progress, and never let one failure kill the rest.
 *
 * Sequential rather than parallel because a browser's own "download several files?" prompt is per-run,
 * and because a serial run gives a truthful running count.
 */
export async function runDownloadBatch(
  targets: readonly DocDownloadTarget[],
  labelOf: (t: DocDownloadTarget) => string,
  onProgress: (done: number) => void,
): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      await saveOne(t, downloadFileName(labelOf(t), t.url));
      saved += 1;
    } catch {
      failed += 1;
    }
    onProgress(saved + failed);
  }
  return { saved, failed };
}

/** How a finished run reads. `failed > 0` is always shown — a partial batch that says nothing is the
 *  exact failure the popup-blocked "view all" would have been. */
export type BatchState =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; saved: number; failed: number };

/**
 * The batch's progress state and its runner, so both panels report a run identically.
 *
 * `onDone` is where each panel's own follow-up goes — clearing the selection on a clean run, which is
 * the only thing they do differently and the only thing worth passing in.
 */
export function useDownloadBatch(labelOf: (t: DocDownloadTarget) => string, onDone?: (r: { saved: number; failed: number }) => void) {
  const [state, setState] = useState<BatchState>({ phase: "idle" });
  const running = state.phase === "running";

  const run = useCallback(
    async (targets: readonly DocDownloadTarget[]) => {
      if (targets.length === 0) return;
      setState({ phase: "running", done: 0, total: targets.length });
      const result = await runDownloadBatch(targets, labelOf, (done) =>
        setState({ phase: "running", done, total: targets.length }),
      );
      setState({ phase: "done", saved: result.saved, failed: result.failed });
      onDone?.(result);
    },
    [labelOf, onDone],
  );

  return { state, running, run };
}
