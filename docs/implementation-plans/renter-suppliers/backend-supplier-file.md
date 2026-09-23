# The supplier's file: name the request on each shared row

Owner, 2026-09-06:

> *"fix it in backend if needed to show the equipment and location"*

**One change, on one endpoint.** The web side of the profile is rebuilt and in the working tree;
this is the only thing it cannot do for itself.

---

## What the row shows, and why that is not enough

`GET /agents/renter-suppliers/{id}` returns, per share:

```ts
{ kind: "share" | "invite", requestCode: string | null, at: string }
```

So the screen can only draw a reference:

```
CEX-020902                                     6 Sep
```

A renter opening his file on one supplier is asking *"what have I sent these people"*. A code is our
filing, not his answer — and there is nothing to press, because the row does not know which request
it belongs to.

---

## The change

Three fields on each send row, read from the request the code already points at:

```ts
requestId: string | null;   // so the row can open it
equipment: string | null;   // "Crawler Excavator 20 ton"
city: string | null;        // "Diriyah"
```

```jsonc
{ "sends": [
  { "kind": "share",
    "at": "2026-09-06T12:04:11.000Z",
    "requestCode": "CEX-020902",
    "requestId": "4cbe044b-…",
    "equipment": "Crawler Excavator 20 ton",
    "city": "Diriyah" }
] }
```

Then the row reads:

```
Crawler Excavator 20 ton · Diriyah  ›          6 Sep
```

---

## Three notes

⚠️ **`city`, never the full address.** The rest of this feature already strips it —
`cityFromAddressLabel` in `getBidFormPreview.ts` — because a card is scraped without auth and a
forwarded link must not carry a customer's yard. A list a colleague can open deserves the same rule.

⚠️ **Nulls are fine and expected.** A request deleted since the share still has a row, and the row
must still draw. The web treats every one of these as optional, so a payload without them renders
exactly what it renders today and this can ship whenever.

⚠️ **`channel`** (`email` · `whatsapp` · `sms` · `copy`) is already recorded by `recordSends` and
dropped on the way out. Returning it would let the row say *"by e-mail"*. Worth it if it is nearly
free; not worth a round of its own.

---

## Not in this ticket, deliberately

Two things were asked for earlier in the day and are no longer needed. Recorded here so nobody
rebuilds them from an older note:

- **A proof flag (`sentMessageId`).** It existed to separate a real send from a declared one. The
  share panel no longer records anything at all — the only writer left is `share-email`, which sends
  the message itself — so every new row is proven by construction.
- **`dealRoomId` / `dealRoomStatus`.** The profile's deal-rooms card opens `/inbox?supplier=<id>`
  instead. The inbox already carries `supplierId` on every bid, so the rooms are reachable from the
  other end without touching this endpoint.
