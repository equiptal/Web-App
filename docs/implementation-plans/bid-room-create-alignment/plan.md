# Bid Room + Create Request — app alignment

Source: free-form change list + mobile-app parity (staging, pulled this session). Build into the real
Web-App components; app = parity target except item 5 where the **renter's chosen formula overrides**
the app. Item 2 (remove deal-room terms from the bid card) is **deferred** (separate). No backend changes.

## Items (working set: 1, 3, 4, 5, 6, 7)

### 1. "Other" for operator certificate (Create Request)
- **App:** operator-cert selector has an "Other" pill → free-text appended into `operatorLicenseLevel`
  (comma-joined). Equipment/safety "Other" already exists on web (`safetyOther`).
- **Web:** `ItemRow.tsx` operator certs are fixed `tuv/spsp/saso-technical` — no Other.
- **Change:** add an "Other" chip + free-text to the operator cert selector (mirror the operator
  **nationality "Custom"** pattern). New `OperatorDetails.certificateOther` in `draft.ts`. In
  `app-adapters.ts`, append the trimmed custom value (commas→spaces) onto `operatorLicenseLevel`.
  i18n: `options.operatorCert.other` + a hint.

### 3. Equipment details → show equipment documents
- **App:** `documents_sheet.dart` — Company + Equipment collapsible sections; each row = status icon +
  label + verified chip + **"View"** (PDF/image viewer). Data: `{companyDocuments, equipmentDocuments}{type,label,labelAr,url,fileType}`.
- **Web:** `BidEquipmentModal.tsx` shows cert/ownership **chips only**. **`fetchBidDocuments(bid.id)`
  already returns that exact shape** (DealRoomDocuments).
- **Change:** in the modal, fetch bid documents and render an **Equipment documents** section — rows
  with label + a **View** action (open `url` in a new tab; pdf/image). Keep the existing spec grid.

### 4. "Price Negotiable" label
- **App:** `_NegotiablePriceHint` — **unconditional** blue tappable row (forum icon + *"This price is
  negotiable — open the deal room to chat with the supplier"*) **above** the price; tap → open/create
  deal room. Only on on-platform cards.
- **Web:** none.
- **Change:** add the hint row above the price on on-platform bid cards (`RequestBids.tsx`,
  `GroupBids.tsx`), tap → `startNegotiation(bid)`. **Not** on `viaSharedLink` cards. i18n `priceNegotiableHint`.

### 5. Fix price calculations (renter's formula — overrides app)
- **Canonical formula (single shared helper):**
  ```
  daysPerPeriod = { PER_DAY:1, PER_WEEK:7, PER_MONTH:26 }   // PER_JOB = flat (no duration)
  durationDays  = max(1, endDate - startDate) (else fallbacks)
  rentalPerUnit = priceUnit==PER_JOB ? rate : rate / daysPerPeriod[unit] × durationDays
  units         = max(1, numberOfUnits)
  rentalSubtotal= rentalPerUnit × units
  mobTotal      = mobPrice × units;  demobTotal = demobPrice × units      // PER-UNIT (app/backend parity)
  subtotalPreVat= rentalSubtotal + mobTotal + demobTotal
  vat           = subtotalPreVat × 0.15;  total = subtotalPreVat + vat
  ```
- **Web bugs:** `comparison.ts` already uses this `÷daysPerPeriod` model; the quotation in
  `RequestBids.tsx`/`GroupBids.tsx` uses `price × (duration??1) × units` and **doesn't** ×units on
  mob/demob → divergent. Fix: extract one helper (from/alongside `comparison.ts`) and use it in **both**
  the comparison and the quotation. PER_JOB → "as operated" flat (no division/duration).

### 6. Quotation — remove certificates + counter-terms sections
- **App quotation:** no certificates section, no counter-terms; sections = Price hero → Details →
  Parties → Agreed terms → Fixed terms → footer.
- **Web (`GroupBids.tsx`):** renders a **Company-documents row** (CR/VAT/National/LC/SASO chips) +
  counter terms.
- **Change:** remove that company-docs/certs row + the counter-terms block. Keep parties (name +
  verified only), equipment, pricing, agreed/fixed terms.

### 7. Quotation terms as bullet points
- **App PDF:** each term = small colored dot (green) + label + value, one per agreed/fixed term.
- **Web:** 2-column `kvRow()`.
- **Change:** render quotation terms as bullet rows (dot + label + value).

## Order
1 → 3 → 4 → 5 → 6 → 7. (Item 2 deferred.)

## Backend dependency
None. Item 3 reuses the existing `/api/me/bids/{id}/documents` (`fetchBidDocuments`). Item 5 is pure
frontend math. No `Moedatech-App` change.

## Risks
- #5: PER_JOB division-by-zero — guard to flat. Reconcile comparison ↔ quotation so they never disagree.
- #5: mob/demob ×units is an app/backend-parity decision (flag if the renter wants them flat).
- #3: documents are presigned URLs — open in a new tab (no in-app PDF viewer dependency).
- RTL for the new label + documents section + bullets.
