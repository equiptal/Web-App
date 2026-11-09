"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { checkCopyPages, sha256Hex } from "./copies";
import {
  addCompanyCheckFiles,
  askCompanyCheckSharp,
  putCopy,
  readCompanyCheckConfig,
  readProgressFile,
  removeCompanyCheckFile,
  runCompanyCheck,
  startCompanyCheck,
} from "./client";
import { CheckSession, type CheckIo, type CheckSnapshot } from "./session";
import type { UploadCheckConfig } from "./types";

/**
 * Moedatech's upload check on the company-documents pile (company doc check CC-12), the React
 * wrapper of `session.ts`. Ported from the Supplier OS (`use-upload-check.ts`).
 *
 * ⚠️ **`null` = no check this time** (off for this renter, refused, failed, not loaded yet), and
 * the page then does exactly what it did before: no line, Send as today. The check is help, never
 * a gate (R10).
 *
 * ⚠️ **Started on the FIRST file added (C11)**, not on Send: the server reads while the renter is
 * still adding, so the answer is usually there by the time he sends. The session waits
 * `startDelayMs` after the last add before anything goes.
 */
const io: CheckIo = {
  start: (files) => startCompanyCheck(files),
  add: (checkId, files) => addCompanyCheckFiles(checkId, files),
  remove: (checkId, fileId) => removeCompanyCheckFile(checkId, fileId),
  run: (checkId) => runCompanyCheck(checkId),
  sharp: (checkId, files) => askCompanyCheckSharp(checkId, files),
  copies: (file, o) => checkCopyPages(file, o),
  sha256: (file) => sha256Hex(file),
  put: (url, body, contentType) => putCopy(url, body, contentType),
  readProgress: (url) => readProgressFile(url),
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
};

const NOOP = () => () => undefined;

export interface CompanyCheck {
  /** The check while it is on for this pile; `null` = no check (R10). */
  check: CheckSnapshot | null;
  /** The renter is about to send: what waits for the start delay goes now. */
  resume: () => void;
}

/**
 * @param files   the pile on screen (File identity is what the session tracks)
 * @param enabled false once the pile is sent, or on a page that shows no form: the session closes
 */
export function useCompanyCheck(files: readonly File[], enabled: boolean): CompanyCheck {
  const [config, setConfig] = useState<UploadCheckConfig | null>(null);
  const [session, setSession] = useState<CheckSession | null>(null);
  const askedRef = useRef(false);

  /**
   * The config, once per page, when the first file arrives. ⚠️ **No «still mounted» flag**: React
   * StrictMode runs effects twice in development, and the OS found that a flag cleared by the first
   * run's cleanup dropped the answer while `askedRef` stopped the second run from asking again.
   */
  useEffect(() => {
    if (!enabled || askedRef.current || files.length === 0) return;
    askedRef.current = true;
    void readCompanyCheckConfig()
      .then((r) => {
        if (r.ok && r.data.enabled) setConfig(r.data);
      })
      .catch(() => undefined);
  }, [enabled, files.length]);

  /**
   * One session per config, created and closed by the SAME effect, so StrictMode's extra
   * mount/unmount closes the first one and makes a fresh one.
   */
  useEffect(() => {
    if (!config || !enabled) return;
    const s = new CheckSession(io, config);
    setSession(s);
    return () => {
      s.close();
      setSession(null);
    };
  }, [config, enabled]);

  useEffect(() => {
    session?.sync(files);
  }, [session, files]);

  useSyncExternalStore(
    session ? (fn) => session.subscribe(fn) : NOOP,
    () => (session ? session.version : 0),
    () => 0,
  );
  const snap = session?.snapshot() ?? null;

  // `timedOut` is a clock, not an event: re-read it while the check has not answered.
  const waiting = snap !== null && snap.mode === "on" && !snap.answered;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [waiting]);

  return {
    check: snap && snap.mode === "on" ? snap : null,
    resume: () => session?.resume(),
  };
}
