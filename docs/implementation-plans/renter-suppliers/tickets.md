# Tickets — My Suppliers (web)

| | |
|---|---|
| **Key** | SUP |
| **Branch** | `web-app/renter-suppliers` off `staging` |
| **Plan** | `docs/implementation-plans/renter-suppliers/plan.md` |
| **Backend** | `docs/implementation-plans/renter-suppliers/backend-tickets.md` (SUP-BE-*) |
| **Prototype** | `prototypes/renter-suppliers-v1.html` — the design is settled; these are ports, not redesigns |

The renter's own supplier list, and the two messages that leave from it. Neither message is new — both exist in a reduced form, and this feature gives them recipients and a template (plan §T).

## The rules every ticket below is written against

- **The list belongs to the company**, never to a user. The vendor flag lives on the link row and nowhere else — the supplier is never told, and another renter's view of the same firm never changes.
- **Nothing here decides anything about a bid.** Compare, negotiate and award happen in the request. Every bid row is a way out to it.
- **A supplier's papers are only readable through a bid.** Never bid → nothing to show, and the panel says so rather than drawing empty rows.
- **No email address, no send** — and the skipped are named before the send, never after.
- **Bilingual throughout.** EN/AR in `src/lib/i18n/*`, RTL through logical properties, `DESIGN.md` tokens, no shadows.

---

## Phase 0 — settled before any code

### SUP-T01 — One join link, one constant
**Scope:** contract · i18n
**Files:** `src/lib/config/store-links.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`, `src/components/workspace/BidCards.tsx`

The invite sent from an off-platform bid card points at `https://moedatech.net` (`en.ts:1471`, `t.workspace.inviteMessage`). The suppliers list will send the same invitation. **Today those are two different destinations**, so the same supplier invited from two places lands in two places.

- Add `JOIN_URL = "https://linktr.ee/moedatech"` beside `APP_STORE_URL` / `PLAY_STORE_URL`, with a comment saying it is the live join page and that `moedatech.net/get` replaces it if marketing builds it (plan §T2).
- `inviteMessage` stops carrying a hardcoded URL. The caller appends `JOIN_URL`, so one edit moves every invitation. The Arabic string moves with it.

**Given/When/Then**
- Given a renter invites from a bid card / Then the message ends at `JOIN_URL`.
- Given `JOIN_URL` changes / Then both invite paths change, and a grep for `moedatech.net` in `i18n` returns nothing.

### SUP-T02 — The email card does not render in production
**Scope:** investigation · pairs with **SUP-BE-18**

Everything in Phase 4 sits on the bid-link card, and it does not arrive in production mail today. Two faults wear the same symptom; establish which before touching code (plan §T1). Needs a **production** bid token — neither is diagnosable from staging.

### SUP-T03 — Is a supplier id reachable from the stores payload? · **done**
**Scope:** investigation · pairs with **SUP-BE-16a**
**Files:** `src/lib/contract/stores.ts`

`StoreCard.id` is a **store**. `supplierIdOf()` now reads the supplier's id under every spelling the two projections have used, flat or nested, string or number, and answers null when the payload names none — so the picker works the day the id is on the wire and says it cannot link when it is not.

**What it did not solve, and could not:** stores are shopfronts. A supplier who has never opened one is absent from that list entirely, which is a different problem with a different fix — **SUP-BE-16b**.

### SUP-T04 — Who in a company may write?
**Scope:** decision

The list belongs to the company, so any member can delete a supplier or rename a group everyone uses. `CompanyHub` already has members and roles. Decide before Phase 1: everyone writes, or owners write and members read.

---

## Phase 1 — the list exists

### SUP-T11 — Contract
**Scope:** contract
**Files:** new `src/lib/contract/renter-suppliers.ts`; edit `src/lib/api/client.ts`, `contract/index.ts`

- Move `RenterSupplier` out of `client.ts:1217` and **extend it, never fork it** — `AwardDialog` already imports that type: `contactName`, `email`, `phone`, `crNumber`, `groups[]`, `extra`, `source`, `store`, `verified`, `rollup`.
- `SupplierRollup` = `bidsApp · bidsLink · lastBidAt · rooms · awards` (`newBids` joins in Phase 3).
- `SupplierProfile` = the row plus `bids[]`, `awards[]`, `sends[]`.

**Given/When/Then**
- Given `listRenterSuppliers` cannot reach the backend / Then it returns `[]` and the screen reads *"you have no suppliers"* — a registry that is not deployed is not a crash.

### SUP-T12 — BFF routes
**Scope:** api-integration
**Files:** `src/app/api/renter-suppliers/**`

`GET /`, `GET /{id}`, `POST /`, `POST /bulk`, `POST /link`, `PATCH /{id}`, `DELETE /{id}` — every one through `relayAsRenter`. Upstream status passes through verbatim: `409 ALREADY_LINKED` carries an id the UI uses, and flattening it into a 502 turns *"they are already in your list"* into *"it broke"*.

### SUP-T13 — The table
**Scope:** feature
**Files:** new `src/app/suppliers/page.tsx`, `src/components/suppliers/**`

Supplier (name + `On Moedatech` badge + contact) · Vendor registration · Contact · Groups · Bids · row actions. Row and name open the profile; the bids cell opens the bids list. Search across name, contact, email and phone. Two pills: **All** and **Registered vendors**.

**Contact — and one provisional rule.** An `own` row shows what the renter typed, always. A `platform` row shows the supplier's own email and phone **once it is flagged as a registered vendor** — which the picker always does (**SUP-BE-20**, ⚠ provisional, owner to confirm). The cell renders identically either way, so nothing in the UI has to change when the answer settles.

**Whatever the payload does not carry, the cell says so** — *not set · add* — and the renter's own entry always wins over the account's.

**Given/When/Then**
- Given a row whose supplier has no account / Then no badge is drawn — the absence is the state.
- Given the contact fields come back null / Then the cell reads *not set · add* and nothing is invented to fill it.
- Given the reveal switch is turned off server-side / Then the screen keeps working and platform rows simply read *not set* — the web must not assume the fields are there.
- Given the list is empty / Then the empty state offers both ways of adding, and says Moedatech's own directory is not this list.

### SUP-T14 — Add from Moedatech
**Scope:** feature · needs **SUP-BE-16b**

The directory picker: search, tick, add. Every tick is a registered vendor by default with a per-row untick, and a master tick above. The dialog states plainly that the supplier is not told and that their name, store and equipment stay theirs.

**It browses SUPPLIERS, not stores.** A supplier with no shopfront is still a supplier — and the renter who cannot find him here types him in by hand, which makes a second row for a company that already has an account. Until `GET /agents/suppliers` exists, the picker reads stores and **says what it is missing**: one line under the search, *"Only suppliers with a store are listed here — add anyone else under Add my own suppliers."* An absence a renter can see is a limit; an absence he cannot is a bug.

**Given/When/Then**
- Given a supplier with no store / When the renter searches for them / Then either they are listed, or the dialog says why they are not — never a silent empty result.
- Given a store row whose `supplierId` is null / Then it is listed but not selectable, with the reason, rather than linking the shopfront.

### SUP-T15 — Add my own suppliers
**Scope:** feature

One dialog, no tabs. Opens on a table of three blank rows — company · contact · email · phone · vendor tick · remove — with *Add another*. A row counts once it has a name and either an email or a phone; the primary button counts them (`Add 3 suppliers`) and is disabled at zero. Beneath it, *Upload a sheet instead*.

### SUP-T16 — The vendor toggle
**Scope:** feature

Optimistic: flips on click, reverts on failure with a toast. Nothing else on the row waits for the round trip. The toast says what changed, in the renter's terms — *"Zahid Tractor is a registered vendor"*.

### SUP-T18 — The award picks from the list, and can add to it
**Scope:** feature
**Files:** `src/components/projects/AwardDialog.tsx`

**The awarding flow is not built here — it exists.** What changes is who can be awarded.

Today the dialog reads `listRenterSuppliers()` and, when the list is empty, falls back to a typed
supplier name. That fallback exists only because this registry did not (`AwardDialog.tsx:140`, and the
note beside it says so: *"the gate follows the list"*). Once the list is real:

- **The typed-name branch goes.** An award carries a supplier row or it is not made — decision 4.
- **`supplierName` is still stored** beside the id, as a snapshot of what the firm was called that day.
  It is never a lookup key again.
- **An unregistered supplier stays shown and disabled**, with the reason — a renter looking for a firm
  he has used before must find it and see why it cannot be picked, not wonder where it went. That rule
  is already in the dialog and does not change.
- **An inline `Add supplier`** in the picker: one row, the same write as *Add my own suppliers*,
  returning the new id straight into the dropdown. Without it, a renter mid-award who finds his
  supplier missing has to leave the dialog, lose the award he was building, and come back.

**Given/When/Then**
- Given the list is empty / When the dialog opens / Then it offers *Add supplier*, not a free-text box.
- Given a supplier is added inline / Then the dropdown selects them without the dialog reloading.
- Given an award is submitted / Then it carries `supplierId`, and a submit without one is refused.

**Depends on:** SUP-T15 (the add write) and **SUP-BE-17** (the backend requiring the id).

### SUP-T17 — Pin the screen
**Scope:** chore
**Files:** `src/lib/uiPins.ts`, `docs/ui-pins.md`

---

## Phase 2 — the list becomes usable

### SUP-T21 — Groups
**Scope:** feature

No groups → one `Create group` button. Once one exists it becomes the groups menu: each row filters, a pen renames, a bin deletes, and the last row starts a new one. **Deleting a group keeps every supplier** and the dialog says so before the red button.

Making a group is pick-then-name: the checkbox column appears only in that mode, and *Name the group* is disabled until at least one row is ticked.

### SUP-T22 — One supplier's groups
**Scope:** feature

The row's pen carries the supplier's groups: a chip each with its own ×, and an *Add to a group* select of every group they are not in. Removing the last chip leaves them ungrouped, and the hint says the group itself is untouched.

### SUP-T23 — The sheet import · **done**
**Scope:** feature
**Files:** `src/lib/contract/sheet-paste.ts`, `src/components/suppliers/ImportSuppliersDialog.tsx`

**Paste or CSV. No `.xlsx`, by decision** — see the plan's decision 6. Parse client-side with no
dependency, map columns, preview, `POST /bulk`. **Five mappable fields — company, contact, email, phone, CR number** — and every other column kept under `extra` as it is. A per-row vendor tick in the preview, on by default, with a master above. **Cap 500 rows / 2 MB, refused with the count, never truncated.**

### SUP-T24 — Suggested
**Scope:** feature

The band above the table: suppliers who bid but hold no row. One tap adds. Dismissal is per user in `localStorage` — not a write.

---

## Phase 3 — the history

### SUP-T31 — The supplier profile
**Scope:** feature

Source badges · `Verified by Moedatech` when the firm is verified · the vendor toggle · the grade with its reason · a bids summary with `Open bids` · company papers · awarded to them · what you sent them · contact and groups · sheet extras.

**Given/When/Then**
- Given a supplier with no Moedatech account and no rooms or awards / Then *Inside the app* is one sentence explaining why, not four zeros.

### SUP-T32 — Company papers
**Scope:** feature

Pills: green when held, faint when not, amber inside 60 days of expiry, the expiry in the title. **The eye is drawn from `downloadUrl`, never from the source** — a presence-only row states presence with nothing to open. Never bid → no pills at all, and a sentence saying papers reach you through a bid.

### SUP-T33 — The bids list
**Scope:** feature

Opened from the bids cell. Every bid with its channel badge and `Open in the request →`. New ones under their own heading and tinted for that viewing. Opening it stamps `seen` (**SUP-BE-13**) and clears the pulsing badge.

### SUP-T34 — The `NEW` badge
**Scope:** feature · needs **SUP-BE-13**

One filled badge on the screen, pulsing, honouring `prefers-reduced-motion`. It is the only thing that animates, which is the point of it.

---

## Phase 4 — the outbound half

### SUP-T41 — Share a request
**Scope:** feature

Recipients by group or individually → the request → an optional *your reference* → an optional line → the message. Skipped-for-no-email named **before** the send with `Add email` inline. `mailto:` with recipients in **BCC**, capped at 25; past it, *Copy the addresses*. `Copy the message` writes the rich card for a Gmail paste.

### SUP-T42 — Invite to Moedatech
**Scope:** feature

Off-platform rows only, the renter's own voice (*my* requests), the second body chosen automatically when they already bid through the link. Recorded through **SUP-BE-15**.

**One message, every channel.** WhatsApp, email, SMS and copy-to-clipboard all send the same body from the same key — `t.workspace.inviteMessage`, ending at `JOIN_URL` (**SUP-T01**). Email adds a subject and nothing else: a second body would be a second thing to keep true, and the first time one changed the two would start saying different things about the same product.

**Given/When/Then**
- Given the invite is sent by WhatsApp and by email / Then the body is character-for-character the same, and only the subject line exists in one and not the other.

### SUP-T43 — The card design
**Scope:** design · **deferred, discuss before starting** · pairs with **SUP-BE-19**

The card carries the equipment, the place, the dates and three terms — fuel, mob & demob, payment — and the mail becomes the card with two names under it. **It must read correctly in WhatsApp, Apple Mail, new Outlook, Gmail, Slack and iMessage**, and the 880×320 image holds two short lines rather than a table. Whatever the image cannot hold must also live in the HTML card, or one link says two different things in two clients.

Design is agreed with the owner first. This ticket exists so it is not forgotten, not so it can start.
