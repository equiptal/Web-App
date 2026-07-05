# Deal Room batch — tickets

Source: change list + `/web:link-backend` alignment (this session). Web-only, no backend changes.
Docs item resolved as option (a) — each party already sees the other's company docs (no work).

## T1 — Multi-select cert-list counter editor (terms sheet) · Web UI
In `DealRoomTerms.tsx`, the counter editor handles price / single-option / binary / free-text but not
multi-value **cert lists**. `operator_certification` and `safety_certifications` are now Negotiable on
staging and compared as a sorted cert-code **set**. Add a multi-select editor for those keys: render
`term.options` as checkable chips, seed from the current value, send the selected set as the counter
`value`.
- **G/W/T:** Given a disputed `safety_certifications` term with options [TÜV, SPSP, SASO], When the
  renter checks TÜV+SPSP and counters, Then `resolveTerm(id,key,"counter",["tuv","spsp"])` is sent.

## T2 — Chat attachments (all media) · Web UI
In `DealRoom.tsx`, the composer attach button is decorative and `sendMessage` is text-only. Wire a real
file picker → upload via the `stream-chat` SDK (`channel.sendImage`/`sendFile`) and send the attachment
on the message; render attachments (image thumbnail / file chip with open link) in the message list.
Accept all media (images, pdf, docs, video) — no type restriction (backend sets none). Disabled while
the room is closed/abandoned (frozen channel).
- **G/W/T:** Given an open deal room, When the renter picks an image/pdf, Then it uploads and appears in
  the thread for both parties; Given a closed room, Then the attach control is disabled.

Backend-dependency tickets: none.
