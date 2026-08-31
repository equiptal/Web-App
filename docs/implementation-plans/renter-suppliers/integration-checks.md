# Integration checks — My Suppliers (SUP)

**What cannot be proved from inside either repo.** The unit tests pin shapes and rules; these are the
things that only answer on a deployed environment with a real company, a real supplier and real bids.

Run them when the backend routes land on staging. Each one names what breaks if it is wrong, because
a checklist without consequences gets skimmed.

| # | Check | Wrong looks like |
|---|---|---|
| 1 | **`supplierId` is a number end to end.** Link a supplier from the picker, then open the award dialog and select them. | The picker writes, the award dropdown shows them, and selecting does nothing — a `===` against a string that is really an integer fails silently and the renter thinks the click missed. |
| 2 | **`kind` and `source` only ever hold the closed sets** (`platform \| own`, `platform \| manual \| sheet \| link_bid`). The backend types both as `string`. | A blank badge, or a row that reads as off-platform when it is not. |
| 3 | **The roll-up attributes each bid to the right channel.** A supplier who bids in the app AND through the shared form shows both counts, and they sum to the bid list's length. | `3 on Moedatech · 1 via link` over a list of three. The renter stops trusting every number on the screen. |
| 4 | **409 `ALREADY_LINKED` carries the row's id.** Add a supplier whose phone is already in the list. | The web says "already in your list" but cannot open the row, because `projectFetch` keeps only the code. If the id is on the wire, widen `ApiError` to carry it. |
| 5 | **Every write answers 503 before the route exists, and never a false success.** | A renter is told a supplier was added, finds nothing, and adds it again. |
| 6 | **`DELETE` returns `keptBids` / `keptAwards`.** Remove a supplier who has both. | The confirmation says "their bids are untouched" without numbers — reassurance nobody believes. |
| 7 | **Bulk 413 carries the count.** Import a sheet over 500 rows. | A refusal with no number, or worse, a silent truncation: the renter believes 900 rows landed and finds out from a supplier who never got a request. |
| 8 | **A `platform` row whose account was deleted keeps its name.** | The row goes blank. The bids and the awards happened; the name must survive them. |
| 9 | **`unparsed` renders red and the key column is null.** Import a row with `phone: "call the office"`. | Either the text is lost (the renter believes they imported it) or it lands in `phone_e164` and poisons every match. |
| 10 | **The list is scoped by COMPANY.** Two members of one firm, two sessions. | One member adds a supplier and the other cannot see it — the whole reason the list is company-scoped. |
| 11 | **The contact-reveal switch (SUP-BE-20) works in both positions.** Flip it off. | The screen breaks instead of showing *not set · add*. The web must never assume the fields are there. |
| 12 | **Matching promotes an `own` row in place.** Add a supplier by phone, then have that phone sign up. | A second row appears, or the promotion drops the groups, the vendor flag or the sheet columns. |
| 13 | **A link submission attaches to the right row**, by CR first, then phone, then a lone email. | A bid lands in another firm's history — the failure this feature can make that nothing else can. |
| 14 | **The `newBids` badge only appears once BE-13 ships**, and clearing is per user. | A colleague reading a supplier's bids clears the badge for everyone. |
| 15 | **The Arabic list reads right-to-left with numbers, phones and codes left-to-right.** | A phone reversed into a number that does not exist. |

## Answered already, and how

- **The route exists but the waiver did not know** — `tests/unit/agents-contract.test.ts` now fails when a route waived as *not built* has since been built. It caught `GET /agents/renter-suppliers` on its first run.
- **The shape of the list row** — read from `serializeRenterSupplier` in the agents repo rather than agreed in prose. That is how deviations 1 and 9 were found before either side deployed.
