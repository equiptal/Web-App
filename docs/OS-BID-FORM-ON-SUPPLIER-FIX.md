# Supplier OS — the bid form reads `"On Supplier"` as *the renter's leg*

**Repo:** Supplier OS (the app serving `os.moedatech.net/{lang}/bid/<uuid>`)
**Raised from:** Web-App, 2026-09-05, after the same bug was found and fixed there
**Severity:** money. A supplier cannot enter a delivery or return price for a leg they own, and the
bid submits `0` for it.
**Size:** one helper plus a handful of call sites. No API change; the endpoint is already correct.

---

## 1 — What changed underneath

`apps/backend/src/handlers/bid-form/getBidForm.ts` changed its **values** on 2026-09-02
(Moedatech-App commit `c304828a`, now on that repo's `main`):

```
deliveryBy / returnBy / requiredTerms.fuel / fatFood / fatTransport

  "Supplier"  →  "On Supplier"
  "Renter"    →  "On Renter"
```

Only the strings changed. The field names, the null semantics and everything else are as before.

`null` still means **the leg does not exist** (self-mobile equipment, `a1d29c96`) and is distinct
from either party.

---

## 2 — Why it breaks the form

Any reader that compares the value to the bare word with `===` now falls through to its else branch.

On the web the code read:

```ts
const delBySup = (it.deliveryBy || "").toLowerCase() === "supplier";
```

`"on supplier" !== "supplier"`, so `delBySup` went **false** — and false means *the renter handles
it*. Two things followed:

1. **The pricing row rendered read-only.** Instead of a price input, the supplier saw the Delivery
   row labelled **"Renter"**: they were told the renter is arranging delivery for a machine the
   renter had in fact assigned to them.
2. **The submit payload sent zero.** The same test guarded the amount:
   ```ts
   mob: { amount: … === "supplier" ? price : 0 }
   ```

So the bid goes out under-priced by the whole transport leg, and neither side can tell from the
result that a question was never asked.

**Evidence this is real, not theoretical.** On Web-App prod, request `LRE-190867` assigns delivery to
the supplier. The off-platform bid from supplier "Yy", submitted 2026-09-03 through the shared link,
carries `Delivery: SAR 0`. The comparison screen shows it as `Delivery: SAR 0 · Return: on you`.

---

## 3 — The fix

One helper, then route every reader through it.

```ts
/**
 * A responsibility value with the endpoint's display prefix taken off.
 *
 * `GET /public/bid-form/{token}` began sending "On Supplier" / "On Renter" on 2026-09-02 where it
 * sent "Supplier" / "Renter" before. Readers comparing the bare word fell through to the branch
 * meaning THE OTHER PARTY.
 *
 * This STRIPS rather than remaps, because both spellings must keep working: an older backend, and
 * any locally-built preview, still emit the bare tokens.
 *
 * Returns "" for null/undefined so callers can compare without a null check.
 */
export function partyToken(v: string | null | undefined): string {
  return String(v ?? "").trim().replace(/^on\s+/i, "");
}
```

⚠️ **Anchored, and the space is required.** `"Onsite crew"` and `"Owner"` must come back unchanged.

Then find and fix every call site:

```bash
grep -rnE '=== *"(supplier|renter|rentee)"|=== *.(SUPPLIER|RENTER|RENTEE).' src/
grep -rn 'deliveryBy\|returnBy\|requiredTerms' src/
```

On the web that was **six** places, and the two that mattered were not the obvious ones:

| Reader | Why it matters |
|---|---|
| the submit payload's `mob` / `demob` amount | **the money** — sends 0 for a leg the supplier owns |
| `delBySup` / `retBySup` | decides whether the row gets a price input at all |
| `partyLabel` (the item's Delivery/Return line) | prints raw `"On Supplier"`, in English, on the Arabic form |
| the term-value localiser | same, for `fuel` / `fatFood` / `fatTransport` |
| the party-values map lookup | keyed `SUPPLIER` / `RENTER`, so the prefixed value misses |
| the responsibility label helper | prints the raw value wherever it is used |

**A reader that tests with a substring or regex is already safe** — `/(supplier|مؤجّر|مورد)/` matches
either spelling. Do not "tidy" those into equality checks.

---

## 4 — Two things to fix at the same time

**Null legs.** If the OS has not taken `a1d29c96` yet, `deliveryBy` / `returnBy` can be `null`,
meaning the leg does not exist at all (a boom truck drives itself). Use `!= null`, never truthiness:

```ts
const delApplies = it.deliveryBy != null;   // covers null AND an older backend that omits the key
```

and skip the whole row when false. `null` coerces to `""`, which is not `"supplier"`, so without this
a self-mobile machine shows a Delivery row reading *"handled by the renter"* — the same collapse of
*absent* into *false*.

**The Arabic labels.** The same commit added `labelAr` and `valueAr` to `contractTerms`. If the OS
still reads only `label` / `value`, an Arabic-speaking supplier reads those rows in English while the
rest of the card is Arabic.

⚠️ `valueAr` arrives with **Arabic-Indic numerals** («٢٤ ساعة»), which contradicts the 2026-09-04
Latin-digits ruling (`1aabf6db`). Normalise on render if the OS follows that ruling.

---

## 5 — How to verify

1. Open a bid link for a request where the renter assigned **delivery to the supplier**.
2. The Delivery row must show a **price input**, not the word "Renter".
3. Enter a price, submit, and confirm the stored bid carries that amount and not `0`.
4. Switch to Arabic: no Latin-script "On Supplier" anywhere on the card.
5. Regression: a request where the **renter** owns the leg still shows the read-only "Renter" row.
6. Regression: self-mobile equipment shows **no** Delivery or Return row at all.

---

## 6 — Bids already affected

Every off-platform bid submitted through a shared link between **2026-09-02** (when the backend
deployed the new values) and whenever the OS is fixed may under-price transport by the full leg.

Code cannot correct these after the fact. Someone has to identify bids where the request assigns a
leg to the supplier and the submitted amount is `0`, and ask those suppliers whether they meant to
charge.

Known so far: `LRE-190867`, supplier "Yy".

---

## 7 — For reference: the web's version of this fix

Web-App `49c7c4b` on `main`, deployed and verified 2026-09-05. `partyToken` lives in
`src/lib/contract/labels.ts`; the readers are in `src/app/bid/[token]/BidFormClient.tsx`,
`src/components/requests/SharedBidSubmissionModal.tsx`, `src/lib/contract/deal-room.ts`,
`src/lib/quotation/bid-quotation.ts` and `src/components/deal-room/DealRoomTerms.ts`, with tests in
`tests/unit/labels.test.ts`.

The web's own `/bid/[token]` is fixed, but shared links point at the OS
(`bidShareUrl` → `${OS_BASE}/bid/${id}`), so **suppliers are still hitting the unfixed form**.
