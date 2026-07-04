# E2E test — bids → compare → deal-room negotiation → confirm → quotation

Full renter journey covering everything shipped this stream: the batched negotiation rework + B1–B5.
Run on **staging** (`https://webstaging.moedatech.net`), **incognito** (dodges the CDN cache). Source of
truth for behavior = the mobile app.

## Preconditions / test data
Sign in as a renter (OTP bypass **`1234`**) with:
- A request with **≥2 bids** (ideally: one on-platform + one off-platform/shared-link; a **multi-unit**
  item; a bid whose terms **conflict** with the request).
- A bid you can **open a deal room** on (on your turn), with **≥1 disputed term**.
- If possible: an **accepted-in-deal-room** bid, a **survey-awarded** bid, and a **confirmed (CLOSED)**
  deal room (to test the quotation). Note any step blocked by missing data.

---

## 1. Bids list + bid cards  (My Requests → a request's bids)
- [ ] **B1 — count parity:** a card's "Conflict N · Matched N" **equals** the counts when you open the Terms modal.
- [ ] Multi-unit bid → price breakdown opens on **Per unit**.
- [ ] `wonViaSurvey` bid → green **"Awarded"** pill + decided styling; accepted bid keeps **"Accepted"**.
- [ ] Terms modal → operator/safety-cert conflict shows "Renter: X · Supplier: Y".
- [ ] Off-platform card → only Conflict/Matched chips (no "Pending review"); Equipment modal MEASUREMENT filled.

## 2. Compare  (`/compare` or "Compare bids")
- [ ] **B4:** top-right reads **"Compare bids"**; selected cards are **flat** (brand ring, no floating);
      **clicking empty space exits** selection (no Cancel button); **Compare** + **Download** still fire.
- [ ] Price shows the **live deal-room rate** for a mid-negotiation bid; **Mobilization + demob** on one row.
- [ ] Decided banner: Accepted → "Accepted — …"; survey-won → "Awarded — …".
- [ ] **B2 (partial):** no cost-responsibility force-greens a live negotiation (unresolved → grey, conflict → red).
      ⚠ **Known limitation (B2b):** a term that was matched at bid-time but became **disputed in the deal room**
      may still show green in compare — the web has no live per-term state (backend-only; out of scope). Log it
      as *known*, not a new defect.

## 3. Deal room — batched negotiation (the rework)
- [ ] **Local staging:** Accept / Keep-mine / Counter on a term stages **locally** → moves to **"You'll send"**
      with **Undo**; **no network call** fires (Network tab) until you submit.
- [ ] **Undo** removes the staged choice; a server-**agreed** term is read-only.
- [ ] **Counter:** rate + mobilization + return → send → **one** `/terms/batch` (all staged terms) **+** one
      `/rate-proposal`; if no terms staged, `/terms/batch` is **skipped**. Room reloads; staging clears.
- [ ] **Accept:** all disputed resolved → Accept → **one** `accept-all-terms` with `contractType:"formal"` +
      `termResolutions`, **no `agreedUnits`** → deal goes to **awaiting supplier confirmation**.
- [ ] **B3:** when it's the **supplier's** turn, terms are **read-only** — conflict + values show, **no**
      Accept/Counter/Keep-mine buttons (not greyed), no Undo.
- [ ] Accept stays disabled while any disputed term is unresolved. Chat / Documents / price breakdown unaffected.

## 4. Quotation  (confirmed/CLOSED deal room → "Download quotation")  — B5
- [ ] **Renders client-side:** opens a rendered bilingual quotation (new window/printable) — no longer hangs
      on "being prepared" (server PDF disabled).
- [ ] **Values = agreed deal-room state:** agreed rate = negotiated rate; mob/return, units, and
      **estimated total** = `(rate × durationFactor + mob + demob) × units`, VAT 15% — **not** original bid values.
      No duration ⇒ "As operated".
- [ ] Parties: supplier + rentee name/phone/email. Terms: **Agreed** and **Fixed** in separate sections (no PRICE row).
- [ ] **Parity:** spot-check rate + total + a couple of terms against the **app**'s quotation for the same deal.

---

## Sign-off
- [ ] §1 bids · [ ] §2 compare · [ ] §3 deal room · [ ] §4 quotation
- Log mismatches with the app (screenshot + value/field). Highest-risk: the quotation **total** and the
  B2b cost-key coloring.
- **Known, not a defect:** B2b (compare can't reflect a live-disputed term) — backend-only, deferred.
