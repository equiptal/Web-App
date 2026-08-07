# v3 — equipment verification view · every element

Target state for the v3 prototype. Supersedes the v2 element list for this surface.
Written from the annotations on `rentee-map-feature-elements.md`.

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

**On click:** full company profile opens, carrying **all company documents**, each with
**open · download · request**.

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
> اطلب من المورد إضافتها → *(triggers the request)*

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

- Full identity and specification
- **The actual documents** — not a summary — each with **open · download · request**
- **اطلب معدّة أخرى** is present here too, not only on the list

## 5. Documents

**Equipment documents:** الاستمارة · التأمين · رخصة التشغيل · البيان الجمركي · شهادة ساسو ·
شهادة السلامة (TÜV / SPSP)

**Company documents:** in the full company profile (§1).

**No verification status is shown on equipment documents.** A document is present or it is not;
present ones can be opened or downloaded, absent ones can be requested. Every document row offers
the same three actions: **open · download · request**.

## 6. The three requests — and where each is raised

| Request | Raised from |
|---|---|
| **اطلب تأكيد التوفّر** | the equipment **card**, and the focused equipment |
| **اطلب معدّة أخرى** | **always visible** on the equipment panel, and inside each equipment's detail |
| **اطلب مستنداً** | **per document row** — equipment documents, and company documents in the profile |
| **اطلب إضافة المعدّات الناقصة** | the shortfall line (§2.2) — an `alternative` with a null `equipmentId` |

Each is bound to one `equipmentId` and delivered as a structured chat card
(`ref` · `kind` · `equipmentId` · `docTypes[]`). Card state is **derived on every render** by
re-reading the machine — never stored on the message.

## 7. Map

Project pin · one pin per machine, green (availability confirmed) / red (not confirmed) · yard names
· distance per machine · colour key.

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
2. **Distance filter** — with one supplier's fleet only, is it still worth having?
3. **Machines he owns but did not offer** — still listed among the offered ones, or a separate group
   under «اطلب معدّة أخرى»?
4. Does the **eligibility confirmed** chip on the card need a reason when it fails, or is that only in
   the focused view?
