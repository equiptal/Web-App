"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";

/* Loaded on the press, not with the page: the room brings the chat client and the whole sheet, and a
   list of bid cards has no use for either until someone counters one. */
const DealRoom = dynamic(() => import("@/components/deal-room/DealRoom").then((m) => m.DealRoom), { ssr: false });

/**
 * «Counter this price»'s three-styles sheet, opened OVER the screen the renter is on (owner,
 * 2026-09-29: *"i want it to be loading over the existing screen the user on"*).
 *
 * ~~`router.push("/deal-room/{id}?act=counter")`~~ drew the sheet on top of the retired room page, so
 * the renter watched the old deal-room chat load behind it and was sent back from there on close.
 * This mounts the same `DealRoom` in its sheet-only mode, portalled to `<body>` so no card's
 * `overflow` or rail clips the fixed overlay. `onExit` fires on close, on a sent counter, and when
 * the room cannot be opened.
 */
export function CounterSheet({ roomId, onExit }: { roomId: string; onExit: () => void }) {
  return createPortal(<DealRoom id={roomId} initialFlow="counter" sheetOnly onExit={onExit} />, document.body);
}
