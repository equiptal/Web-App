# v3 — equipment verification view · every element

Target state for the v3 prototype. Supersedes the v2 element list for this surface.
Written from the annotations on `rentee-map-feature-elements.md`.

> ## ⚠ Read this before treating anything below as a rule — corrected 2026-08-09
>
> `docs/specs/004-deal-room-equipment-verification.md` §6 cites this file as **source of truth for
> layout**. It is: the panel/map split, what sits where, and what each element is *for* are still the
> design. **It is NOT the source of truth for behaviour** — it was written on 2026-08-07 and had received
> **none** of the 7–9 August corrections, so it went on stating rules the owner had withdrawn.
>
> **On any behavioural question, [`specs/004`](specs/004-deal-room-equipment-verification.md) and
> [`specs/004a`](specs/004a-addendum-chat-and-the-request-loop.md) win.** Every withdrawn rule is now
> struck **in place** below, with what replaced it, rather than deleted — a reader who cannot see that a
> decision was made will make the opposite one again.
>
> The four that had gone furthest, all corrected below:
>
> | This file said | The rule since |
> |---|---|
> | Company documents can be **requested** (§1, §6) | **Withdrawn.** *A document request names a machine.* The company panel has **no request control of any kind** — 004 §6.1, 004a §8, AC-71/72 |
> | Every document row offers **download** (§1, §4, §5) | **Withdrawn per row.** Downloading is the **batch** beneath the list; **view** is what a row keeps — 004a §8.2, 004 §6.6 |
> | A held row can be requested (§5) | **Withdrawn.** *You can only ask for what is not there.* Selectable = **missing** — 004 §6.6, AC-73 |
> | *"**Every** document row offers the same three actions"* (§5) | **Withdrawn.** It now sweeps in the **operator's** rows, which are **inert**: status only, no view, no download, no checkbox, no ask, no count — 004 §6.6a, AC-75 |
>
> Geometry belongs to the prototype `Deal Room Map.html`, extracted in
> [`implementation-plans/deal-room-rentee-map/design-v3.md`](implementation-plans/deal-room-rentee-map/design-v3.md).

---

## 0. What this view is

**One item · one supplier's bid.** Always.

The renter reaches it by **clicking a specific supplier's bid card**. On a multi-item RFQ he has
already chosen the item, then the bid, before arriving. So the view never compares offers and never
switches items — those decisions are upstream and already made.

**Its single job: verify that this offer is real.**

That resolves the 001 §6.2 tension outright — the offers list isn't hidden behind a back button, it
simply isn't part of this surface.

## Layout

```
┌────────────────────────── left panel ──────────────┬──────── map ────────┐
│  supplier name ✓            (click → full profile) │                     │
│  ٤ رافعات شوكية · ٣ طن        total of this type   │   project pin       │
│  ─────────────────────────────────────────────     │   machine pins      │
│  [ اطلب معدّة أخرى ]              always visible    │   green / red       │
│  ─────────────────────────────────────────────     │                     │
│  equipment card                                    │                     │
│  equipment card            ← the list              │                     │
│  equipment card                                    │                     │
│  ─────────────────────────────────────────────     │                     │
│  price · [التفاصيل ▾] · [اطلب سعراً أقل]            │                     │
└────────────────────────────────────────────────────┴─────────────────────┘
```

---

## 1. Panel header — the supplier

**Shows only:** company name + **verified tick**.

**On click:** the **company panel** opens, carrying **all company documents** — ~~each with
**open · download · request**~~ **each with `view`; downloading is the batch beneath the list, and there
is no request control anywhere on this panel.**

> **Corrected 2026-08-09.** Two of the three actions were withdrawn on 2026-08-08 and this line kept
> stating them:
> - **`request` is gone.** *A document request names a machine* (owner's ruling) — 004 §6.1, 004a §8,
>   **AC-71/72**. `RenteeRequestDraft`'s `document` arm cannot even express a company-scope ask.
> - **Per-row `download` is gone.** Downloading is what the **batch** does (004a §8.2); a per-row control
>   would be a second control for one act. **`view` stays per row**, so the renter can open one paper
>   without selecting anything.
> - What did **not** change: the list is batch-selectable. Select-all and a checkbox on every row **that
>   carries a url** were withdrawn with the ask and then **restored the same day** — only the ask was
>   decided (004a §8.1). A row with no url is listed but not tickable.
> - It is a **document list, not a profile page** (004 §6.1), and the papers are **five**: CR · VAT
>   certificate · national address · local content · SASO registration. Company rows — unlike equipment
>   rows — carry **verification state and expiry**.

Not shown here: contact info, deals count, IBAN, CR/VAT inline. Those live inside the full profile,
sourced from the company record — not restated in the header.

## 2. Fleet total — the line above the list

Directly under the header, state **how many machines of this type the supplier has in total**:

> **٤ رافعات شوكية · ٣ طن**

- It is the **total of this type he owns**, not the count he offered. Those are different numbers and
  the difference is the point — a supplier with four and an offer of one is a different proposition
  from a supplier with exactly one.
- The **type and size come from the request**, so the line reads in the renter's own terms.
- It sets the expectation for the list directly beneath it: if it says four and three cards render,
  the fourth is accounted for by the offered-units line below, not silently missing.

### 2.1 Offered units — multi-unit offers only

When the bid offers **more than one unit**, state the total he offered:

> **العرض: ٥ وحدات**

On a single-unit offer this line does not render — there is nothing to reconcile.

### 2.2 The shortfall message — only when it exists

Compare **offered units** against **registered machines**. They are usually equal, and when they are,
**say nothing** — a line that always appears stops being read.

When he offered **more units than he has registered machines**, and only then:

> **٣ وحدات معروضة بلا معدّة مسجّلة**
> ~~اطلب من المورد إضافتها~~ → **اطلب من المؤجّر إضافتها** *(triggers the request)*

**Corrected 2026-08-09 — «المورد» → «المؤجّر».** This surface says **«المؤجّر»** and never «المورد»
(product ruling, `coverage.md` F-8b: the shipped web app is 79 «المؤجّر» to 21 «المورد»). The rule holds
even against the owner's own wording — 004 §11 flags exactly this for «اطلب من المورد إرساله», which
ships as «اطلب من المؤجّر إرساله». One word overrules it.

- The number is the **difference**, not the offered total: offered ٥ − registered ٢ = **٣ claimed**.
- **The action sends the request.** It asks the supplier to register and attach the missing machines
  to this offer.
- **It is an `alternative` request with a null `equipmentId`** — there is no machine to name, which is
  the whole problem. Do **not** reintroduce the retired `add_to_offer` kind for this; it is rejected
  server-side (`rentee-request.service.ts`, `RETIRED_REQUEST_KINDS`).
- These claimed units have **no location, no documents and no serial**, so they are never drawn on the
  map and never appear as cards. This line is the only place they exist in the UI — which is why its
  absence must mean "nothing claimed", never "not checked".

## 3. Equipment list — the body of the panel

One card per machine. **The card carries:**

| Element | Note |
|---|---|
| **Front image** | the machine is recognised by sight first |
| **Model** | |
| **Year** | |
| **Distance** | from its yard to the project |
| **Eligibility confirmed?** | resolved against bid readiness |
| **Document chips** | which certificates exist — TÜV, SPSP, … |
| **اطلب تأكيد التوفّر** | raised directly from the card |

**Not on the card:** serial number, load capacity.
The serial identifies the machine to the *system*; it does not help the renter recognise it.

**Above the list, always visible:** **اطلب معدّة أخرى**.

## 4. Equipment focus — selecting a card

Selecting a card focuses that machine: its pin highlights, and the panel shows **everything** about it.

- ~~Full identity and specification~~ — **withdrawn.** The detail is a **hero photo + two tabs + the
  six-cell match grid against this request**; 004 §6.5 rules out a specification dump in as many words,
  and **AC-14** was rewritten on 2026-08-08 for saying "full specification"
- **The actual documents** — not a summary — ~~each with **open · download · request**~~ **each with
  `view`; download is the batch; and a row is requestable only when the paper is MISSING**
- **اطلب معدّة أخرى** is present here too, not only on the list

> **Corrected 2026-08-09.** *You can only ask for what is not there* (owner's ruling, 004 §6.6, AC-73):
> an ask naming a paper the lessor can see on his own file can only be answered *"it is already there."*
> **Selectable = missing**, enforced in the model (`DocRow.requestable`, and again inside
> `batchDocumentRequest`) so the checkbox and the ask cannot disagree. Per-row **download** went the same
> day (004a §8.2). And the operator's certificates are **not** on these terms at all — see §5.

## 5. Documents

**Equipment documents:** الاستمارة · التأمين · رخصة التشغيل · البيان الجمركي · شهادة ساسو ·
شهادة السلامة (TÜV / SPSP)

**Company documents:** in the full company profile (§1).

**No verification status is shown on equipment documents.** A document is present or it is not.
~~present ones can be opened or downloaded, absent ones can be requested. **Every** document row offers
the same three actions: **open · download · request**.~~

> **WITHDRAWN 2026-08-09 — this sentence is wrong three times over, and its worst word is "Every".**
>
> 1. **The operator's certificates are outside the document machinery entirely** (004 §6.6a, **AC-75**,
>    owner's ruling 2026-08-08). "Every row" sweeps them in, and **they are inert**: a third group of
>    rows showing **present or not, green or red, and nothing else** — no view, no download, no checkbox
>    in any mode, no place in any batch, no select-all key, and **no attention count** (not zero — none
>    at all, because a pill promises an action and there is none). The reason is not a UI preference:
>    **nothing validates an operator document on upload**, so handing the renter a file to open presents
>    an unchecked upload as verified evidence, on the one surface that exists to answer *can I trust
>    this?* Presence is a fact the platform can stand behind; the contents are not.
> 2. **Per-row `download` is withdrawn** for every family — downloading is the **batch** beneath the
>    list, and **`view`** is what a row keeps (004a §8.2, 004 §6.6).
> 3. **"absent ones can be requested" is right; "present ones can be requested" was the bug.** The rule
>    is *you can only ask for what is not there* — **selectable = missing** (AC-73). Note the equipment
>    rule is **missing**, not *url-less*: a paper can be on the file with no signed link, and that row is
>    not a gap the lessor can close. The **company** rule is the mirror image — a row with **no url** is
>    not tickable, because there its batch **saves**.
>
> **The rule now:** one **row** grammar — thumbnail with a status dot · name · status line · **view** —
> and **three different verbs** underneath it. Equipment rows: view, batch download, batch request when
> missing. Company rows: view, batch download, **never** a request. Operator rows: **nothing but the
> colour.** A group with nothing missing renders **no batch control at all** rather than a disabled one.
>
> What survives unchanged is the sentence's first half, and it is the load-bearing one: **equipment
> documents carry presence only, never a verification badge.** Company rows are the deliberate
> exception — they carry verification state and expiry, because a company paper is checked and expires.

## 6. The ~~three~~ **four** requests — and where each is raised

| Request | Raised from |
|---|---|
| **اطلب تأكيد التوفّر** | the equipment **card**, and the focused equipment |
| **اطلب معدّة أخرى** | **always visible** on the equipment panel, and inside each equipment's detail |
| **اطلب مستنداً** | per **missing** document row — ~~equipment documents, **and company documents in the profile**~~ **equipment documents ONLY** |
| **اطلب إضافة المعدّات الناقصة** | the shortfall line (§2.2) — an `alternative` with a null `equipmentId` |

> **Corrected 2026-08-09, two things.**
>
> - **The company arm of «اطلب مستنداً» is withdrawn** (owner's ruling 2026-08-08; 004 §6.1, 004a §8,
>   **AC-71/72**). *A document request names a machine.* The company panel has **no request control of
>   any kind**. The rule is held by the **payload type**, not by the UI: `RenteeRequestDraft`'s
>   `document` arm requires `scope: "equipment"` and a **non-nullable** `equipmentId`, so the withdrawn
>   ask cannot be written down, and `RenteeAsk` has no `scope` field for a caller to assert one with.
>   The company panel's checkboxes came back later the same day (004a §8.1) and are **unrelated** —
>   they feed a batch **download**, which raises no request and appears nowhere in this table.
> - The heading said **three**; the table has always listed **four**. `scope: "company"` survives for
>   **exactly one** ask — the shortfall's «اطلب إضافتها», which asks *for* a machine and so has none to
>   name. **Do not remove it** while removing the company document ask; they are different things.

Each is bound to one `equipmentId` and delivered as a structured chat card
(`ref` · `kind` · `equipmentId` · `docTypes[]`). Card state is **derived on every render** by
re-reading the machine — never stored on the message.

## 7. Map

Project pin · one pin per **offered** machine, green (availability confirmed) / red (not confirmed) ·
yard names · distance per machine · ~~colour key~~.

> **Corrected 2026-08-09 — there is no colour key.** v3 states the scale **in copy** (004 §6.8); no
> legend component exists and `colourKeyModel` was dropped from `bid-map.ts` with ticket **T15**
> (`replan-v3.md`). Two further points this line elides: the map draws **offered machines only** — the
> hollow not-in-offer pin variant is dropped (**AC-09/10**) — and a unit whose availability is `absent`
> is **not drawn at all**, since an undrawable unit cannot carry a colour (**AC-22**).
> Colour comes from `unitAvailability`/`locationSource` and **never** from the `yardConfirmed` boolean.

Selecting a card focuses its pin; selecting a pin focuses its card.

**One colour scale only: green = confirmed, red = not confirmed.** Distance colours nothing.

## 8. Price · terms · quotation — the panel footer

The price sits at the **bottom of the left panel**:

- the figure, with **التفاصيل ▾** expanding the full breakdown (rate, mob, demob, VAT, duration, total)
- **اطلب سعراً أقل** opens **the existing three-step sheet**, unchanged

Terms and the quotation are reached through that existing flow — not rebuilt here.

## 9. Chat

Unchanged. Messages, attachments (view + save), unread badge, notifications while on the map, and the
pre-composed unsent request cards produced by §6.

---

## Removed from v3

| Removed | Why |
|---|---|
| **The request block** (top bar, item strip) | the item is already chosen upstream |
| **The offers list / bid economics as a browsable thing** | one bid per view; this surface verifies, it doesn't compare |
| **Off-platform submissions — entirely** | they have no equipment and no coordinates, so there is nothing to verify or plot |
| Contact info · deals count · IBAN from the header | moved into the full company profile |
| Serial number · load capacity from the card | not how a renter recognises a machine |
| Per-document verification status | present/absent plus actions is the whole model |
| Map composition box | the panel already states it |

## Carried over unchanged

Offer composition (offered vs registered vs confirmed vs claimed) · location precedence ·
distance semantics · the derived-state rule for request cards · one colour scale ·
«غير مؤكّدة» meaning *unanswered*, never *rejected*.

## Open

1. ~~Where does offer composition render?~~ **Answered — §2.1 and §2.2.** The offered
   total sits under the fleet total; the claimed shortfall appears only when there is one.
2. ~~**Distance filter** — with one supplier's fleet only, is it still worth having?~~
   **Answered — yes, 2026-08-08 (owner decision), after first being answered "no".** Removed as AC-28,
   then **reinstated** and built wider: the equipment list's whole filter row (distance · availability ·
   year · certificates), pure in `equipment-list.ts`, with the four rules of 004 §6.4a. AC-28 rewritten
   from a prohibition into the control it forbade; AC-28a→28e added; ticket **V17/V18**. The caution that
   removed it survives as those four rules — it was sound about the **v2** control, which filtered
   competing *offers*, and does not carry to a list of one lessor's machines.
3. ~~**Machines he owns but did not offer** — still listed among the offered ones, or a separate group
   under «اطلب معدّة أخرى»?~~ **Answered — neither. Offered only.** The list is flat, nearest-first and
   **offered-only**; a machine he owns but did not offer is **not listed** and is reachable **only** as
   an «اطلب معدّة أخرى» request (004 §6.4, AC-09/10; ticket V5). The map follows — no hollow
   not-in-offer pin.
4. ~~Does the **eligibility confirmed** chip on the card need a reason when it fails, or is that only in
   the focused view?~~ **Answered — no reason, anywhere (AC-30).** «التوفّر غير مؤكّد» plus the request
   is the whole message; the cause (`bid_pin` / `bid_yard` / `listing_yard`) is not the renter's problem
   to interpret. It is also **one** chip carrying availability *and* commitment, not a chip plus a band,
   so every card keeps the same height (AC-32) — and unconfirmed reads as **unanswered**, never refused.

**All four are closed. Kept as a record so a later change does not reopen them by accident** — the same
reason 004 §10 keeps its own.
