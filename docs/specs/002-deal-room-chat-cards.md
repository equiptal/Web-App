# Deal-room chat cards — render the `custom` payload the backend already sends

| | |
|---|---|
| **Key** | DRCARD |
| **Status** | **IMPLEMENTED** — verified 2026-08-05 |
| **Author** | yfa245 |
| **Created** | 2026-08-04 |
| **Layers** | web · app-backend (two one-line string fixes, optional) |
| **Links** | `docs/specs/001-deal-room-rentee-map.md` §7.13 (adds a sixth card type on top of this) |

> Acceptance IDs in this document are namespaced `DRCARD-AC-NN`. They are local to this
> spec and are **not** `moedatech-specs` acceptance IDs.

> ## ✅ THIS IS BUILT — verified against the code 2026-08-05
>
> Do not implement this spec. It shipped. What exists:
>
> | | |
> |---|---|
> | `src/lib/contract/deal-rounds.ts` | `ChatCard` union, `parseChatCard()` (`:150`), `chatCardOfMessage()` (`:203`) |
> | `src/components/deal-room/ChatCard.tsx` | the card renderer |
> | `DealRoom.tsx:848-874` | the card branch runs **before** the `system_bot` early return — the whole of defect W1 |
> | `tests/unit/deal-room-cards.test.ts` | **47 tests, passing** |
>
> All six card types are handled: `rate_proposal`, `rate_response`, `term_accepted`, `counter`,
> `term_updated`, `term_reopened`.
>
> **Still worth checking before closing this out:** whether §7's two backend Arabic-text fixes were made
> (`deal-room.service.ts` `proposeRate`/`respondToRate`), since the web now renders from `custom` and would
> mask them; and whether `AC-17`'s translate affordance actually reaches card messages.
>
> The document below is kept as the record of what was specified and why.

## 1. Problem & outcome

The backend attaches a structured `custom` payload to every negotiation message. **The web throws all of
it away.** Five distinct card types — a rate proposal, a rate acceptance, a term accept, a counter-offer,
a term edit — all render as the *same* grey one-line pill, and two of them render **in English inside an
Arabic RTL conversation**.

The data is already on the wire. Nothing needs to be added to the backend for the web to fix this.

**Outcome:** each card type renders as itself, in Arabic, with the numbers it carries — and a rate
proposal is actionable from the message rather than only from the bottom bar.

## 2. Who it's for

The renter in the web deal room (`/deal-room/[id]`). Suppliers and the mobile app are unaffected — mobile
already renders these cards; the web is the only client that does not.

## 3. Current state

### What is actually on the wire

`apps/backend/src/services/stream.service.ts:38-53` defines the vocabulary, and
`inflatesUnread(customData)` reads `custom.type` to decide the unread badge:

```ts
const UNREAD_INFLATING_CARD_TYPES = new Set([
  'term_accepted', 'counter', 'term_updated', 'rate_proposal', 'rate_response',
]);
```

Both `postSystemMessage` and `postUserMessage` spread it onto the message (`:153`, `:183`):

```ts
...(customData && { custom: customData }),
```

**The card types are not whitelisted anywhere.** `customData` is a pass-through
`Record<string, unknown>`, and `apps/backend/src/validators/deal-room.schema.ts` does not constrain it.

### What each card carries, and the text it falls back to

All five are posted through `postSystemMessage`, so they arrive as `user.id === 'system_bot'`.

| `custom.type` | Posted at | Fallback `text` | Payload the web ignores |
|---|---|---|---|
| `rate_proposal` | `deal-room.service.ts:2066` | **English** — `"{name} proposed a rate: 3000 per day"` (overridden only if the caller passed `message`) | `proposedRate`, `priceUnit`, `proposedByRole`, `status`, `mobPrice`, `demobPrice`, `rentalUnits`, `originalMessageId` |
| `rate_response` | `:2260` | **English, no override** — `"{name} accepted the proposed rate"` | `originalMessageId`, `response` |
| `term_accepted` | `:1518` | Arabic — `"{name} قبل بند {termLabel}"` | `termKey`, `value` |
| `counter` | `:1539` | Arabic — `"{name} قدّم عرضًا مضادًا على {termLabel}"` | `termKey`, **`oldValue`, `newValue`** |
| `term_updated` | `:1574` | Arabic — `"{name} عدّل بند {termLabel}: {old} → {new}"` | `termKey`, `oldValue`, `newValue` |
| `term_reopened` | `:1557` | Arabic — `"{name} أعاد فتح بند {termLabel} للتفاوض"` | `termKey` — *note: not in the unread set* |

### What the web does with it

`src/components/deal-room/DealRoom.tsx:844-851` returns **before** the `custom` branch at `:853`:

```tsx
if (m.user?.id === "system_bot") {
  return (
    <div className="sysev" key={m.id}>
      <span className="material-icons-outlined">bolt</span>
      <span>{m.text}</span>
    </div>
  );
}
```

`.sysev` (`deal-room-proto.css:120`) is a centred grey pill with a bolt icon. So **every** card above
renders as that pill, showing `m.text` and nothing else. The only `custom` the web reads at all is
`custom.kind === "location"` (`:855`), on party messages.

## 4. Scope

**In:**
- A card registry in the web keyed on `custom.type`, rendering each of the six types above.
- Arabic/English labels composed **client-side** from `src/lib/i18n/*`, not taken from `m.text`.
- Accept / counter actions on a pending `rate_proposal`, wired to the existing rate endpoints.
- `term_reopened` handled, even though the backend does not inflate unread for it.

**Out:**
- Supplier-side rendering (a different app).
- Changing which types inflate unread — that is `001`'s §7.13 decision, not this spec's.
- `rentee_request` (specced in `001` §7.13; it lands in the same registry this spec creates).
- A component-test harness. This repo has none; see the testability caveat in §9.

**Assumptions:**
- A0 — **The payload is the source of truth, `m.text` is a fallback.** Rendering from `custom` is what
  lets the web fix the language without a backend deploy.
- A1 — `m.text` is still rendered verbatim for any `custom.type` the registry does not know, so a card
  type added later degrades to today's behaviour rather than vanishing.
- A2 — The two English strings are also worth fixing at source (§7), but the web must not *depend* on
  that fix: old messages already in Stream keep their English text forever.

## 5. Flows

1. The renter opens the deal room. The message list loads from Stream.
2. For each message the web checks `custom.type` **before** checking `user.id === 'system_bot'`.
3. A known type renders its card: an icon, an Arabic title, the values from the payload, and a timestamp.
4. An unknown type — or no `custom` — renders exactly as it does today.
5. A `rate_proposal` with `status: 'pending'` that the renter did **not** send shows **قبول** and
   **عرض مضاد**. Accept calls the existing respond-to-rate path; counter opens the existing rate composer.
6. Once responded, the card shows the outcome instead of the buttons — read from the subsequent
   `rate_response`, not from local state.

## 6. Web surface — implement in `Web-App`

- **Pages / components:**
  - `src/components/deal-room/DealRoom.tsx` — reorder the render branches; delegate to the registry.
  - `src/components/deal-room/ChatCard.tsx` *(new)* — one component, switching on `type`.
  - `src/components/deal-room/deal-room-proto.css` — card classes alongside `.sysev`.
- **Contract / adapters:**
  - `src/lib/contract/deal-rounds.ts` — add the discriminated union and a parser. This file already
    models the round payload, so the types belong here rather than in the component.
- **BFF routes:** none new. Accept/counter reuse whatever `DealRoom.tsx` calls today for the bottom bar.
- **Store:** none.
- **i18n:** every card label added to `src/lib/i18n/en.ts` + `ar.ts` under `dealRoom.cards.*` —
  `rateProposed`, `rateAccepted`, `termAccepted`, `termCountered`, `termUpdated`, `termReopened`,
  `accept`, `counter`, `perDay`/`perWeek`/`perMonth`, `mobilisation`, `demobilisation`, `units`.
- **RTL notes:** numbers and price units stay LTR inside an RTL bubble — wrap the numeric run in
  `dir="ltr"`, the same treatment serials get in the machine panel. The old → new arrow on
  `term_updated` must point **right-to-left** in Arabic; use a logical glyph (`←`) or flip it, never a
  hardcoded `→`.

### 6.1 The parser is where the defects die

```ts
// src/lib/contract/deal-rounds.ts
export type ChatCard =
  | { type: "rate_proposal"; rate: number; priceUnit: PriceUnit; byRole: "rentee" | "supplier";
      status: "pending" | "accepted" | "countered"; mobPrice?: number; demobPrice?: number;
      rentalUnits?: number; originalMessageId?: string }
  | { type: "rate_response"; response: "accepted"; originalMessageId?: string }
  | { type: "term_accepted"; termKey: string; value: unknown }
  | { type: "counter"; termKey: string; oldValue: unknown; newValue: unknown }
  | { type: "term_updated"; termKey: string; oldValue: unknown; newValue: unknown }
  | { type: "term_reopened"; termKey: string };

/** null → render `m.text` as today. Never throw: a malformed card must not blank the chat. */
export function parseChatCard(custom: Record<string, unknown> | undefined): ChatCard | null;
```

Two rules that matter:

- **`parseChatCard` never throws and never returns a partial card.** A card missing `proposedRate` is
  not a rate proposal — it returns `null` and the message falls back to `m.text`. A thrown error inside
  a list render blanks the whole conversation, which is a worse failure than an ugly pill.
- **`termKey` is localised through the existing term-label lookup**, not printed raw. `PRICE` and
  `MOB_DEMOB` are not user-facing strings.

## 7. Backend contract — implement in `Moedatech-App`

> **Self-contained hand-off.** Optional, and small. The web fix does not depend on it — but without it,
> every *new* rate proposal keeps arriving with English fallback text for any client that has not been
> updated, and the messages already in Stream keep theirs regardless.

- **Owning app:** `apps/backend`
- **Endpoints:** none new, none changed.
- **Change 1 — `proposeRate` fallback text is English in an Arabic product.**
  `apps/backend/src/services/deal-room/deal-room.service.ts:2066`:
  ```ts
  message || `${callerName} proposed a rate: ${proposedRate} ${priceUnitEn(priceUnit)}`
  ```
  `priceUnitAr()` already exists at `:366` and is right there unused. Compose the Arabic string, or
  send both and let the client pick.
- **Change 2 — `respondToRate` accept text is English with no override.** `:2260`:
  ```ts
  `${callerName} accepted the proposed rate`
  ```
  Unlike the counter branch immediately below it, this one has no `message ||` prefix, so a caller
  cannot supply Arabic even deliberately.
- **Validation rules:** unchanged. `customData` stays a pass-through.
- **Data model delta:** none.
- **Error codes:** none.
- **Backward compatibility:** these are display strings only, consumed as `message.text`. Mobile renders
  cards from `custom` and does not parse `text`, so changing them cannot break it. **Existing messages
  are not migrated** — the web must handle English text on old messages regardless (assumption A2).

## 8. Acceptance criteria

| ID | Layer | Given / When / Then |
|---|---|---|
| DRCARD-AC-01 | web | **Given** a message with `custom.type: 'rate_proposal'` **When** the chat renders **Then** it renders as a rate card showing the rate and price unit from the payload, not as a `.sysev` pill |
| DRCARD-AC-02 | web | **Given** an Arabic locale and a `rate_proposal` whose `m.text` is the English fallback **When** the card renders **Then** every visible string is Arabic, composed from i18n — the English text is never displayed |
| DRCARD-AC-03 | web | **Given** a `rate_response` with `response: 'accepted'` **When** it renders **Then** it shows an Arabic acceptance card, again ignoring the English `m.text` |
| DRCARD-AC-04 | web | **Given** a `counter` card carrying `oldValue` and `newValue` **When** it renders **Then** both values are shown — today the counter's numbers exist only in `custom` and the renter sees a counter-offer with no figure |
| DRCARD-AC-05 | web | **Given** a `term_updated` card **When** it renders **Then** the term label is localised from `termKey` and the raw key (e.g. `MOB_DEMOB`) is never displayed |
| DRCARD-AC-06 | web | **Given** a `term_accepted` card **When** it renders **Then** it is visually distinct from `counter` and `term_updated` — the three are one identical pill today |
| DRCARD-AC-07 | web | **Given** a `term_reopened` card **When** it renders **Then** it renders as its own card, even though the backend does not count it toward unread |
| DRCARD-AC-08 | web | **Given** a `custom.type` the registry does not know **When** it renders **Then** it falls back to today's `.sysev` pill with `m.text` — an unknown card degrades, never disappears |
| DRCARD-AC-09 | web | **Given** a message with no `custom` at all **When** it renders **Then** behaviour is byte-identical to today |
| DRCARD-AC-10 | web | **Given** `custom.type: 'rate_proposal'` with `proposedRate` missing or non-numeric **When** parsed **Then** the parser returns null and the message renders as `m.text` — it does not throw, and the rest of the conversation still renders |
| DRCARD-AC-11 | web | **Given** a pending `rate_proposal` the renter did **not** send **When** it renders **Then** it offers accept and counter actions wired to the existing rate endpoints |
| DRCARD-AC-12 | web | **Given** a pending `rate_proposal` the renter **did** send **When** it renders **Then** no accept action is offered — a party cannot accept their own proposal |
| DRCARD-AC-13 | web | **Given** a `rate_proposal` followed by a `rate_response` naming it via `originalMessageId` **When** the list renders **Then** the proposal shows its outcome and no longer offers actions, derived from the response message rather than local state |
| DRCARD-AC-14 | web | **Given** a `rate_proposal` carrying `mobPrice`, `demobPrice` or `rentalUnits` **When** it renders **Then** those values appear — they are on the wire today and shown nowhere |
| DRCARD-AC-15 | web | **Given** an Arabic RTL layout **When** a card shows a rate, a price unit or a unit count **Then** the numeric run renders LTR inside the RTL bubble, and the old→new transition reads right-to-left |
| DRCARD-AC-16 | web | **Given** any card type **When** it renders **Then** it carries a timestamp, like every other message in the stream |
| DRCARD-AC-17 | web | **Given** a card whose text is in the wrong language **When** the renter views it **Then** a translate affordance is available — today the `system_bot` early return happens before `canTranslate` is computed (`DealRoom.tsx:857`), so the messages most likely to be in the wrong language are the only ones that cannot be translated |
| DRCARD-AC-18 | app-backend | **Given** a rate is proposed with no explicit `message` **When** the system message is posted **Then** its `text` is Arabic, built with the already-present `priceUnitAr()` |
| DRCARD-AC-19 | app-backend | **Given** a proposed rate is accepted **When** the system message is posted **Then** its `text` is Arabic, and a caller-supplied `message` can override it as the sibling counter branch already allows |
| DRCARD-AC-20 | app-backend | **Given** the text strings change **When** the mobile client renders the same messages **Then** nothing changes for it, because it renders from `custom` and does not parse `text` |

## 9. Test cases

| ID | Satisfies | Layer | Where | Case |
|---|---|---|---|---|
| DRCARD-TC-01 | AC-01, AC-02 | web | `tests/unit/deal-room-cards.test.ts` | `parseChatCard` on a real `rate_proposal` payload → typed card with rate + unit; the view-model's strings come from i18n, and the English fallback text appears in no output field |
| DRCARD-TC-02 | AC-03 | web | same | `rate_response` → accepted card; English `m.text` absent from the view-model |
| DRCARD-TC-03 | AC-04, AC-05 | web | same | `counter` yields both `oldValue` and `newValue`; `term_updated` yields a localised label for `PRICE` and `MOB_DEMOB`, never the raw key |
| DRCARD-TC-04 | AC-06, AC-07 | web | same | `term_accepted`, `counter`, `term_updated`, `term_reopened` produce four distinct card kinds |
| DRCARD-TC-05 | AC-08, AC-09 | web | same | unknown `custom.type` → null; absent `custom` → null; both signal the `m.text` fallback |
| DRCARD-TC-06 | AC-10 | web | same | malformed payloads (missing rate, string rate, null custom, `custom` not an object) all return null and none throw |
| DRCARD-TC-07 | AC-11, AC-12, AC-13 | web | same | action selector: pending + not mine → accept/counter; pending + mine → neither; a `rate_response` matching `originalMessageId` → no actions and an outcome |
| DRCARD-TC-08 | AC-14 | web | same | `mobPrice`/`demobPrice`/`rentalUnits` survive parsing into the view-model |
| DRCARD-TC-09 | AC-16 | web | same | every card kind's view-model carries the message timestamp |
| DRCARD-TC-10 | AC-15, AC-17 | web | **manual** | RTL numerals, LTR numeric runs, direction of the old→new transition, and the presence of a translate affordance on a card — no component harness in this repo |
| DRCARD-TC-11 | AC-18, AC-19 | app-backend | `apps/backend/src/tests/services/deal-room-negotiation.test.ts` | `proposeRate` with no `message` → Arabic text using `priceUnitAr`; `respondToRate` accept → Arabic text, and a supplied `message` overrides it |
| DRCARD-TC-12 | AC-20 | app-backend | same | `custom` payloads are byte-identical before and after the text change — the contract mobile depends on is untouched |

**Testability caveat, stated plainly.** `parseChatCard` and the view-model builders are deliberately
pure so vitest covers them (`TC-01`…`TC-09`). This repo has **no component-test harness** — no
`@testing-library`, no jsdom — so *rendered* RTL direction and the translate affordance (`AC-15`,
`AC-17`) are **manual-verify**. Adding a harness should be its own ticket, not folded in here.

## 10. Open questions

| # | Question | Blocks | Owner |
|---|---|---|---|
| 1 | Should `term_reopened` inflate unread? It is the only term action excluded from `UNREAD_INFLATING_CARD_TYPES`, and it is unclear whether that is deliberate or an omission. | AC-07 only cosmetically; the web renders it either way | product |
| 2 | Should the web render an accept action for **term** cards too, or stay read-only and leave terms to the bottom bar? This spec scopes actions to `rate_proposal` alone. | AC-11 scope | product |
| 3 | Do we backfill Arabic text onto historical messages in Stream, or accept that old rate proposals stay English for any client reading `text`? Rendering from `custom` makes this cosmetic for the web but not for notification previews. | nothing — A2 assumes no backfill | product |
| 4 | Push/notification previews use `message.text`. If that stays English for old messages, the notification is English even once the in-app card is Arabic. Is that acceptable, or does it force Change 1? | §7 priority | product |

## 11. Changelog

| Date | Change |
|---|---|
| 2026-08-04 | Spec created. Verified from source that `custom` is already in production for five card types (`stream.service.ts:38-53`), that the validator does not whitelist them, and that the web discards all of it: `DealRoom.tsx:844` returns on `user.id === 'system_bot'` before the `custom` branch at `:853`, so all five render as one grey `.sysev` pill. Recorded four defects this exposes — `rate_proposal` and `rate_response` fall back to **English** text in an Arabic RTL chat (`deal-room.service.ts:2066`, `:2260`, while `priceUnitAr()` sits unused at `:366`); `counter` carries its `oldValue`/`newValue` only in `custom`, so a counter-offer displays **without its figure**; and the `system_bot` early return precedes `canTranslate` (`:857`), so the messages most likely to be in the wrong language are the only ones that cannot be translated. |
