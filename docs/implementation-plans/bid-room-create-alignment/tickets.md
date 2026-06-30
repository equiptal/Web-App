# Tickets — Bid Room + Create Request alignment

Order: T1 → T2 → T3 → T4 → T5 → T6. Item 2 (remove deal-room terms from bid card) deferred. No backend deps.

## T1 — Operator certificate "Other" (item 1) · Web UI + Contract
Add an "Other" chip + free-text to the operator cert selector in `ItemRow.tsx` (mirror the operator
nationality "Custom" pattern). Add `OperatorDetails.certificateOther: string` in `draft.ts`. In
`app-adapters.ts` append the trimmed custom value (commas→spaces) onto `operatorLicenseLevel`. i18n
`options.operatorCert.other` + hint (EN/AR).
- **G/W/T:** Given operator certs = [tuv] + Other "X-cert", When mapped, Then `operatorLicenseLevel`
  contains both `tuv` and `X-cert`.

## T2 — Equipment details: show equipment documents (item 3) · Web UI
In `BidEquipmentModal.tsx`, fetch `fetchBidDocuments(bid.id)` and render an **Equipment documents**
section (rows: label + verified chip + **View** → open presigned `url` in a new tab). Keep the spec
grid. Match the app `documents_sheet` layout. i18n: section title + "View".
- **G/W/T:** Given a bid whose equipment has docs, When the modal opens, Then each doc shows a row with
  a working View link; Given no docs, Then the section is hidden.

## T3 — "Price Negotiable" label (item 4) · Web UI
Add an unconditional tappable hint row above the price on **on-platform** bid cards (`RequestBids.tsx`,
`GroupBids.tsx`); tap → `startNegotiation(bid)`. Hidden on `viaSharedLink` cards. i18n
`bids.priceNegotiableHint` (EN/AR).
- **G/W/T:** Given an on-platform bid, When the card renders, Then the negotiable hint shows above the
  price and tapping opens/creates the deal room; Given a shared-link bid, Then no hint.

## T4 — Fix price calculations (item 5) · Web UI + Contract
Extract one pricing helper (daysPerPeriod `{PER_DAY:1,PER_WEEK:7,PER_MONTH:26}`, PER_JOB flat; rate
÷periodDays ×durationDays ×units; mob/demob ×units; VAT 15%) and use it in **both** `comparison.ts` and
the quotation (`RequestBids.tsx`, `GroupBids.tsx`) — replacing `price × (duration??1)` and the
non-×units mob/demob.
- **G/W/T:** Given a weekly rate 700, 14 days, 2 units, When computed, Then rentalPerUnit = 700/7×14 =
  1400 and rentalSubtotal = 2800; Given mob 800 + 2 units, Then mobTotal = 1600; VAT = 15% of pre-VAT.
- **Tests:** period math (day/week/month-26/job), mob/demob ×units, VAT, comparison↔quotation agree.

## T5 — Quotation: remove certificates + counter terms (item 6) · Web UI
In `GroupBids.tsx` quotation, remove the Company-documents/certs row (CR/VAT/National/LC/SASO chips) and
the counter-terms block. Keep parties (name + verified), equipment, pricing, agreed/fixed terms.
- **G/W/T:** Given a generated quotation, Then no certificates/company-docs section and no counter-terms
  section appear.

## T6 — Quotation terms as bullets (item 7) · Web UI
Replace the 2-column `kvRow()` term rendering with bullet rows (colored dot + label + value), one per
agreed/fixed term.
- **G/W/T:** Given the quotation terms, Then each renders as a bulleted line (dot + label + value).
