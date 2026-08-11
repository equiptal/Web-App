# Deal Room Rentee Map — end-to-end acceptance checklist

Every AC below carries a **real ID from a merged spec** — no invented criteria. Sources:
`004-deal-room-equipment-verification.md`, `004a-addendum-chat-and-the-request-loop.md`,
`002-deal-room-chat-cards.md`, `003-supplier-deal-room.md`.

**Legend**

- `[CORE]` — the main path. A tester must check all of these.
- `[EDGE]` — a corner case.
- `[SUPERSEDED]` — the spec text is contradicted by a later owner ruling. The ruling wins; the line under the AC says what it changed to.

Walk it in the order given — it follows a tester's own path through the feature.

---

## 1 · Entering the surface

### RM3-AC-01 — the view resolves exactly one bid [CORE]
**Given** a renter with a platform bid **When** he opens the equipment-verification surface **Then** it is scoped to exactly one bid — no offer list, no supplier switcher, no item strip.

*How to test:* From the request's bids screen, on a platform bid card, click **«افحص المعدّات ›»**. You land on `/bids/<bidId>/equipment`. Confirm one supplier's name only; no `[قائمة │ خريطة]` toggle, no chip strip of other items, no way to page to another bid without going back.

### RM3-AC-01 (second clause) — opening the surface creates no deal room [CORE]
**Given** a bid with `dealRoomId === null` **When** the renter browses **Then** no `DealRoom` row is created.

*How to test:* Pick a bid never negotiated. Open the surface, click 3–4 machines, open **التفاصيل**, the documents tab, **مستندات الشركة**, and the **المحادثة** dock — without sending. Go back and refresh. The bid must still have no deal room, and the supplier must still be able to change his offered count (`BID_OFFER_LOCKED` not armed).

### RM3-AC-25 — an off-platform offer never opens this surface [CORE]
*How to test:* Find a shared-link bid on the same request. **«افحص المعدّات ›»** must not render on it. Opening it shows the old `SharedBidSubmissionModal`. Then paste `/bids/link-<id>/equipment` directly — it must not render the verification surface.

### RM3-AC-02 — the panel header states identity, nothing else [CORE]
*How to test:* Top of the left panel: company name, **«✓ شركة موثّقة»** only if verified, and **«مستندات الشركة ›»**. No phone, no email, no deals count, no IBAN, no CR, no VAT. On an unverified supplier the chip is **absent**, not greyed.

### RM3-AC-26 — an offer with no registered machine [EDGE]
*How to test:* Open a bid where a price and count were given but nothing registered. Expect **«لا توجد معدّة مسجّلة في هذا العرض»** — no placeholder cards, no empty photo slots, no match grid. Company documents and the chat dock still work.

---

## 2 · The map and its pins

### RM3-AC-21 — what the map draws [CORE]
*How to test:* One pin labelled **«مشروعك»**; one marker per offered machine; a distance chip on each; a dotted line back to the project pin.

### RM3-AC-19 — pin colour and card chip come from one derivation [CORE]
Both take colour from `unitAvailability(unit)` (via `locationSource`), **never** from `yardConfirmed`.

*How to test:* Every card reading **«مؤكّد توفرها»** (green `#12904A`) has a green marker; every **«لم يؤكد توفرها بعد»** (red `#C62A2A`) has a red one. Walk all machines — no pair may disagree. **All-pins-green on a bid you know has unconfirmed yards is the classic symptom of reading `yardConfirmed`** — fail it.

### RM3-AC-22 — an undrawable unit is not drawn [CORE]
*How to test:* On a 5-offered / 3-registered bid, count markers — exactly **3**. No grey or hollow marker stands in for the 2 claimed units. A machine whose yard was deleted (`locationSource: none`) also has no marker, while still being listed in the panel.

### RM3-AC-20 — unconfirmed reads as unanswered, never refused [CORE]
*How to test:* Red machines must read **«لم يؤكد توفرها بعد»**. Fail on «غير متاحة», «رفض», "unavailable", "declined".

### RM3-AC-30 — the unconfirmed chip carries no reason [CORE]
*How to test:* Read every string near the red chip. No mention of `bid_pin`, `bid_yard`, `listing_yard`, "inferred from the bid" or "registered yard". The only adjacent affordance is **«اطلب التأكيد»**.

### RM3-AC-15 — one selection value reaches both surfaces [CORE]
*How to test:* Click card #2 — its card **and** its marker take the selection; #1 drops. Click marker #3 — card #3 becomes selected. Click card #3 again — selection clears on both. Two cards or two markers must never look selected at once.

### RM3-AC-34 — landing pre-selection [CORE]
*How to test:* Hard-reload. One card carries the accent, one pin is lifted with a halo and an in-offer tag, and **no detail is open**. On a multi-unit offer with several confirmed machines, the pre-selected one must be the bid's primary machine (`bid.equipmentId`).

### RM3-AC-35 — the attention cue is finite [CORE]
*How to test:* The pre-selected card pulses ~6 times over ~9 seconds then rests permanently. Leave the page a minute — it must never pulse again. Its resting shadow is preserved throughout, so the card never appears to shift.

### RM3-AC-29 — no bid quality anywhere [CORE]
*How to test:* Sweep header, pills, cards, detail, documents, footer. No score, ring, percentage, star rating or A/B/C grade.

---

## 3 · Counts and the shortfall

### RM3-AC-03 — single-unit offer shows one pill [CORE]
*How to test:* `unitsOffered` of 1 → exactly one pill (**«٣ رافعات شوكية ٣ طن لدى المورد»**). No «في هذا العرض» pill, no shortfall alert.

### RM3-AC-04 — multi-unit, fully backed, two pills and no alert [CORE]
*How to test:* 3 offered / 3 registered → two pills, **no** orange alert. Its absence must reliably mean nothing is claimed.

### RM3-AC-05 — the alert states the difference [CORE]
*How to test:* 5 offered / 3 registered → the alert reads the **difference (٢)**, e.g. «٢ وحدة في العرض بلا معدّة مسجّلة — لا تظهر على الخريطة». **Fail if it says ٥.**

### RM3-AC-06 — the alert is orange, never red [CORE]
*How to test:* Compare it with a red availability chip on the same screen — visibly different families.

### RM3-AC-31 — `claimed = offered − registered`, clamped at zero [CORE]
*How to test:* Supplier owns 8 qualifying, offered 5, backed 3 → shortfall **2**. Not 0 (counting all 8 fleet rows) and not 3. Where registered exceeds offered the alert must not render at all — never a negative number.

### RM3-AC-07 — the shortfall action composes `alternative` with a null id [CORE]
*How to test:* Click **«اطلب إضافتها»**. The review card renders under the supplier's identity, naming no serial. This is the **one** surviving `scope: 'company'` ask. No surface may produce `add_to_offer` (the backend 400s it).

### RM3-AC-08 — the type word agrees with the count and comes from the request [CORE]
*How to test:* The pill's noun matches what you requested, not the supplier's listing name. Check agreement across 1-, 2- and 5-unit bids.

### RM3-AC-65 — pills describe the offer; the footer prices the agreed count [CORE]
*How to test:* 3 offered, 2 agreed → the pill still reads «٣ في هذا العرض» and the shortfall still computes against 3, while the footer totals on 2.

### RM3-AC-66 — the difference is stated once, in the footer [CORE]
*How to test:* The footer carries one line explaining price-on-2 vs offer-of-3. Exactly one place — not repeated by the pills.

### RM3-AC-67 — an unapproved counter must not rewrite the offer [EDGE]
*How to test:* Propose a different unit count and do **not** let the supplier accept. Reload — neither pills nor footer may move to the proposed number.

---

## 4 · The equipment list, filters and sort

### RM3-AC-09 — flat, nearest first, offered only [CORE]
*How to test:* Distances ascend top-to-bottom. No group headings. Card count equals the `inBid` machines. **There is no sort control** — if you see a sort dropdown, fail it.

### RM3-AC-10 — owned-but-not-offered machines are not listed [CORE]
*How to test:* Owned-total 8 / in-offer 3 → **3 cards**, not 8. No "خارج العرض" section, no greyed cards. The only route to the others is the dashed **«اطلب معدّة أخرى»** row.

### RM3-AC-11 — what a card carries [CORE]
*How to test:* All six — photo, model, year, availability chip, distance from **your project**, and either certificate chips or the explicit **«لا شهادات على المعدّة»**. An empty gap is a fail.

### RM3-AC-12 — no serial and no load capacity on the card [CORE]
*How to test:* No serial (e.g. `FD30T-118207`) and no tonnage on any list card. (Serials do appear supplier-side and inside request cards — correct.)

### RM3-AC-32 — availability and commitment are one chip [CORE]
*How to test:* A green in-offer machine carries **one** chip, not a chip plus a separate "في هذا العرض" band. Every card in the list is the same height.

### RM3-AC-13 — the confirm ask is on the card [CORE]
*How to test:* **«اطلب التأكيد»** is visible on a red card and composes without entering **التفاصيل**. Absent on a green card.

### RM3-AC-33 — the request action is blue, not navy [CORE]
*How to test:* **«اطلب التأكيد»** beside the red chip is saturated blue `#2563EB`. If it renders navy `#1C3550`, fail. *(The documents-footer buttons are deliberately navy — a different control.)*

### RM3-AC-28 — the distance filter [CORE]
*How to test:* On a bid spanning bands (one at 20 km, one at 140 km) a **المسافة** row appears with ≤ ٥٠ / ≤ ١٠٠ / ≤ ٢٠٠. **«الكل» is not itself a chip** — clearing leaves no chip active. Press ≤ ٥٠ and only machines within 50 km remain.

### RM3-AC-28a — only criteria the request asked for, and only "HAS" [CORE]
*How to test:* Request named TÜV only → a TÜV chip, no SPSP chip. No minimum-year ask → no **السنة** control. No "missing TÜV" or "no certificate" chip anywhere. Press ≤ ٥٠ **and** ٢٠٢٠+ **and** two cert chips → survivors are within 50 km AND 2020+ AND (TÜV OR SPSP).

### RM3-AC-28b — a control that would split nothing does not render [CORE]
*How to test:* All machines confirmed → the **التوفّر** control is **absent**, not present-and-useless. All inside 50 km → the whole **المسافة** row is absent. Where filters do render, press each chip alone — none may empty the list.

### RM3-AC-28c — unknown distance kept; unknown year filtered out [EDGE]
*How to test:* A machine with no resolvable distance stays visible under ≤ ٥٠ كم, and the row says so. A machine with no year on file **disappears** under «٢٠٢٠ أو أحدث» — agreeing with the red year cell in its match grid.

### RM3-AC-28d — the count always states the whole [CORE]
*How to test:* From 8, filter to 3 → **«٣ من ٨»**. The denominator stays 8. Fail on «٣ من ٣».

### RM3-AC-15 (filter clause) — the map follows the filter [CORE]
*How to test:* Filter 8 down to 3 → 3 markers. Select a far machine **first**, then filter it out — the selection is dropped, not left pointing at a hidden card.

### RM3-AC-28e — the filtered empty state names what emptied it [CORE]
*How to test:* Combine chips until nothing survives. The state names the active chips, states the offer's total, and offers **«امسح التصفية»**. Pressing it restores everything. Wording must be clearly different from AC-26's «لا توجد معدّة مسجّلة».

### §6.4a — الملحقات is specified but never renders [EDGE]
*How to test:* Request attachments, open a bid — there must be **no** الملحقات control (no fleet row records attachments). If one appears and empties the list, fail it.

---

## 5 · The machine panel — detail and match grid

### RM3-AC-14 / RM3-AC-36 — what the detail is made of [CORE]
*How to test:* In order — hero photo with a back control · exactly **two** tabs · one line with the availability chip, distance and yard · the six-cell match grid · document rows on the second tab · **«اطلب معدّة أخرى»** at the bottom. It must **not** be a specification dump.

### RM3-AC-37 — every match cell states its actual finding [CORE]
*How to test:* All six cells (year & manufacturer · attachments · photos · proof of ownership · equipment certificate · operator certificates) carry a real finding string, never a bare colour. Something asked for and missing → red. Something never asked about → **grey, not red**.

### RM3-AC-14 (photo cell) — scored over required slots only [CORE]
*How to test:* A machine with only front + plate reads **"2 of 2 uploaded"**, green. **Fail on "2 of 4"** or a red cell while the documents tab reports nothing missing — that contradiction is the exact defect this ruling fixed.

### RM3-AC-14 (per-machine scoping) — the grid follows the selected machine [CORE]
*How to test:* On a minimum-year request, a machine built before it reads red; a compliant one reads green. Header and grid must never disagree about the machine on screen.

### RM3-AC-19 (detail line) — the chip matches the pin [CORE]
*How to test:* A red machine's detail chip is red and its marker is still red.

---

## 6 · Documents and operator status

### RM3-AC-42 — three groups, and only two of them count [CORE]
*How to test:* Photos · documents · operator documents. The first two carry an attention pill; **the operator group carries none** — not «٠», not a green "nothing missing". The tab badge excludes operator rows.

### RM3-AC-73 — one rule for every document row [CORE]
*How to test:* Check four rows against the request:
1. Required + held → green, openable, **no checkbox in request mode**.
2. Required + absent → **red «لا يوجد مستند بعد»**, counted, tickable.
3. Not required + held → renders, no colour, no verdict, not counted.
4. Not required + absent → **must not render at all**.

Then sweep: no red row may exist for anything the request never asked for and the platform does not mandate.

### RM3-AC-74 — the photo group's rows and count [CORE]
*How to test:* A machine with only the front photo → green front, **red** plate, and **no** meter or side row. Fail on any "N of 4". Add a meter shot — the row appears with no verdict and no colour.

### RM3-AC-39 — equipment rows show presence only [CORE]
*How to test:* No «موثّق» badge, no seal, no expiry date anywhere on the equipment tab. (These *do* appear on the company panel — deliberate asymmetry.)

### RM3-AC-69 — view where there is a url, nothing where there isn't [CORE] [SUPERSEDED]
*Superseded:* on the **machine's documents tab** the per-row `↗` is withdrawn — the owner's UAT of 2026-08-11 (*"no per-row arrow"*), which is also what the prototype draws. The row itself replaced it: pressing a row puts its paper in the viewer at the top of the panel. The arrow survives in the two places that ruling does not reach — a row holding **several** files keeps one per extra file (its first is what the press frames, see AC-76), and the **company panel**, whose rows do not press because that list has no viewer of its own.

*How to test:* On the machine's documents tab a held paper's row **presses**, and the paper appears in the frame above; a row holding one file carries **no arrow**, and no per-row download glyph. On **مستندات الشركة** each held paper still opens in a new tab from its own control. A missing paper exposes no button anywhere — not even a greyed one that swallows clicks.

### RM3-AC-76 — every held file is reachable [EDGE] [SUPERSEDED]
*Superseded:* *"open both"* is now two different controls, by the same UAT — one frame can hold one subject, so the row's first file is reached by pressing the row and the rest keep their arrows.

*How to test:* A machine holding two ownership papers (istimara + customs) must let you reach **both**: press the row for the first, and the arrow beside it for the second, separately named. Fail if the second file has no control at all.

### RM3-AC-75 — the operator's certificates are a status only [CORE] [SUPERSEDED]
*Superseded:* the **group is gone from the documents tab**. The owner's UAT of 2026-08-11: *"operator will not be viewed in the document section at all — only in the equipment field, as its cert exists or not."*

The 2026-08-08 ruling this AC records had already emptied the group of every act — no view, no ask, no tick, no count — because nothing validates an operator document on upload and presence is the only claim the platform can stand behind. What the UAT settles is **where that one claim belongs**: on the match grid's **شهادات المشغّل** cell, which was already scoring the same certificates from the same readiness inputs, rather than as a third heading in a tab whose every other row can be opened, ticked and asked for. The AC's own clauses are not contradicted so much as left with nothing to check — there is no operator row to carry a dot, refuse a tick, or omit a pill.

*How to test:* On **مستندات المعدّة** confirm there is **no operator group and no operator row**, whatever the request asked of the operator (TÜV · SPSP · CERTIFIED) and whatever the machine holds (`operator_tuv`, `operating_license`, and the British `operating_licence`). Then confirm the statement survives where it moved: **شهادات المشغّل** reads «مفقود: …» when an asked-for operator certificate is absent and «… — موجودة في ملف الوحدة» when it is on the file — and, unlike the other green cells, **it does not press**, because an operator paper still exposes no file.

Also, still: a held operator paper must not fall back into **مستندات المعدّة** as an openable, tickable row. With no group of its own to catch it, that is the only place left for it to land.

---

## 7 · Selecting and requesting

### RM3-AC-77 — one checkbox column, two mutually exclusive modes [CORE]
*This AC won the footer.* AC-38 used to forbid a disabled ask button outright; that clause is superseded — the prototype the owner pointed at on 2026-08-10 agrees with this AC, not with AC-38 (see AC-38). Where the two ever disagree about the footer, this one is the contract.

*How to test:*
1. Nothing ticked → **both** footer buttons visible and **both disabled** (~70% opacity, `not-allowed` cursor).
2. Tick a **held** row → «تنزيل» lights with a count; the request button stays disabled; **missing** rows dim to ~45% and go inert (click the checkbox, try tabbing to it — out of the tab order).
3. Back to neutral, tick a **missing** row first → **«اطلب من المورد إرساله»** lights; held rows go inert.
4. Clear the last tick → neutral, every row tickable again.
5. A held row **with no url** is tickable in neither mode; a held row is requestable in none.

### RM3-AC-78 — exactly one select-all link, chosen by the majority [CORE]
*How to test:*
1. 4 held / 2 missing at neutral → only **«حدّد كل المتاح»** renders (confirm the other is not also on screen).
2. 2 held / 4 missing → only **«حدّد كل الناقص»**.
3. A 2 / 2 tie → **«حدّد كل المتاح»**.
4. Press it — only that mode's rows tick, and the button's count equals the rows ticked.
5. **«إلغاء التحديد (n)»** returns to neutral with both buttons disabled.

### RM3-AC-38 — the full control set [CORE] [SUPERSEDED]
*Superseded:* the clause **"no batch request control at all — not even a disabled one"** is overturned, because it contradicts AC-77 and the prototype agrees with AC-77.

**The evidence** — two prototype screenshots the owner pointed at on 2026-08-10, saying the prototype is what's correct here. Neutral state: **both** footer buttons render and **both** are greyed. Download mode (one photo ticked): «تنزيل (١)» goes solid navy, the ask button stays greyed, the missing row dims. So the button the current selection cannot feed is **visible and disabled**, never absent — which is AC-77 exactly.

**Therefore AC-77 governs the footer**, and a permanently-rendered disabled ask button is correct rather than a defect. AC-38's other clauses are untouched — the row anatomy (thumbnail + status dot, name, status line), the per-row **view**, the single checkbox column, and the per-mode select-all all stand.

*How to test:* Every row has a thumbnail with a status dot, a name and a status line. On an all-held machine there is **no request select-all** (AC-78 leaves only «حدّد كل المتاح») while the ask **button** still renders, disabled. On an all-missing machine, no download select-all — and «تنزيل» still renders, disabled.

### RM3-AC-16 — requestable is exactly "missing" [CORE]
*How to test:* Tick everything reachable in request mode and open the preview. `docTypes` contains **only** missing papers — no held paper, no operator certificate. Constructing a request naming a held paper must be impossible.

### RM3-AC-71 — a document request names a machine [CORE]
*How to test:* The review card renders under **that machine's** identity with its serial stamped by the backend. From **مستندات الشركة** there is no path that produces a document request of any kind.

### RM3-AC-72 — the company panel: read, select, save — never ask [CORE] [SUPERSEDED]
*How to test:* Open **«مستندات الشركة ›»** and confirm:
- five papers — CR · VAT · national address · local content · SASO registration;
- **view** opens each held paper;
- held papers carry a checkbox; a paper with no file is listed but not selectable;
- one select-all **«حدّد كل المتاح»** plus **«إلغاء التحديد (n)»**;
- **exactly one** footer button, and it downloads — **no «اطلب…» button, not even disabled**. (This is the **company** panel, which raises no ask at all; it is untouched by AC-38's overturned clause, which is about the machine's documents tab, where both buttons do render.)
- ticking 3 saves **3 files to disk** (not 3 tabs) and reports how many landed.

*Superseded:* v2's **RMAP-AC-110** and **RMAP-AC-117** specified a `scope: 'company'` document request. **Withdrawn** — company documents are view/download only. The only surviving company-scope ask is the shortfall's «اطلب إضافتها».

### RM3-AC-40 — company rows carry verification and expiry [CORE]
*How to test:* Each row carries verified · valid-until *date* · renews annually · or red "no document yet". Contrast with the equipment tab, where none may appear.

### RM3-AC-41 — five papers, an attention count, no IBAN [CORE]
*How to test:* Exactly five rows including SASO registration. No IBAN or bank detail. On a firm holding 4 of 5 the count reads **1** (needing action), not 5.

### RM3-AC-68 — company documents are served bid-scoped [CORE, backend]
*How to test:* Rows carry real openable documents. In devtools the call is `GET /marketplace/bids/{bidId}/company-documents` with **no company id parameter**. Alter the `bidId` to an unrelated bid — it must be refused.

### RM3-AC-70 — local content and SASO resolve from either storage [EDGE, backend]
*How to test:* A supplier whose files sit in the legacy columns and one in `held_cert_docs` must render and open identically. The renter must not be able to tell which storage served the paper.

---

## 8 · Requests and chat cards

### RM3-AC-17 — every request carries the machine as data [CORE]
*How to test:* Compose all four — **اطلب تأكيد التوفّر**, **اطلب معدّة أخرى**, the document batch, **اطلب إضافتها**. Each shows a review card **before** sending; nothing sends until you press send. Rename a listing supplier-side and confirm an already-sent card updates (resolved at render time).

### RM3-AC-18 — card state is derived on every render [CORE]
*How to test:* Send an availability request. Have the supplier confirm the yard from his readiness card **without replying in chat**. Reload — the pin turns green **and** the card reads answered, though no reply message exists.

### §6.7.3 — "another machine" asks by TYPE, never as a swap [CORE]
*How to test:* Compose **«اطلب معدّة أخرى»** from inside a detail. The text reads like «هل لديك رافعة شوكية ٣ طن أخرى مسجّلة لديك؟». **Fail if it names the serial or contains «بدل».** The card still carries the `equipmentId` as data.

### §6.7.2 — asking for something already on file [EDGE]
*How to test:* Under the two-mode rule this interruption should be **unreachable**. Confirm a mixed selection is impossible and no "already provided" confirmation ever appears. *(This flow predates the "ask only for what is not there" ruling; it has no live AC and should not be built.)*

### §6.7.5 — downloading more than one document [EDGE]
*How to test:* One paper ticked → downloads directly, no prompt. Three ticked → three files land (saved, not opened as tabs). If a "ملف PDF واحد" merge is offered it must actually work; if deferred it must be **hidden**, not shown and broken. Failures are counted and stated, never swallowed.

### RM3-AC-48 — every custom card type renders as a card [CORE]
*How to test:* Scroll a room that has seen a rate proposal, counter, term acceptance, term edit, term reopen, request and reply. Each renders as its own card. **Fail on any centred grey `.sysev` pill with a bolt icon.**

### DRCARD-AC-01 / -02 — the rate card renders from the payload, in Arabic [CORE]
*How to test:* In Arabic locale a rate proposal shows the rate and price unit as a card, with no English sentence visible.

### DRCARD-AC-04 / -05 — counters show figures, term keys are localised [CORE]
*How to test:* A counter card shows both old and new values. No raw key (`PRICE`, `MOB_DEMOB`) is ever printed.

### DRCARD-AC-08 / -10 — unknown and malformed cards degrade [EDGE]
*How to test:* In a long thread nothing blanks the conversation; an unrecognised card shows its plain text rather than disappearing.

### DRCARD-AC-11 / -12 / -13 — rate actions [CORE]
*How to test:* The supplier's proposal offers **قبول** and **عرض مضاد**; your own proposal offers no accept. Accept one, reload — the original card shows its outcome with buttons gone, derived from the response message rather than local state.

### DRCARD-AC-15 — RTL numerals and direction [EDGE]
*How to test:* Numbers in a rate card are not reversed; the old→new arrow reads right-to-left.

---

## 9 · The chat dock

### RM3-AC-23 — a persistent dock, and no edge rail [CORE]
*How to test:* **«المحادثة»** is present in every state — no selection, detail open, company panel open. No vertical edge rail of icons.

### RM3-AC-43 / RM3-AC-44 — tabs only when there are several bids [CORE]
*How to test:* A supplier bidding on two items → one tab per item, each its own conversation. A supplier with one bid → **no tab strip**.

### RM3-AC-45 — two members of one firm are one counterparty [EDGE]
*How to test:* Two colleagues (same `supplierCompanyId`) bidding on different items appear as **one** supplier with two tabs.

### RM3-AC-46 — per-tab unread [CORE]
*How to test:* With the Excavator tab open, have the supplier message the Generator bid. Refresh — the Generator tab carries its own badge.

### RM3-AC-47 — no room is created on opening a tab [CORE]
*How to test:* Open a roomless tab — nothing is created (the supplier's count is still editable). Send — now the room exists.

### RM3-AC-49 — switching tab does not move the map [CORE]
*How to test:* Select machine #3, note the viewport, switch tabs. The map must not recentre and #3 stays selected.

### RM3-AC-62 — the arrival notice carries the ref and machine [CORE]
*How to test:* Send a request, close the chat, have the supplier reply, then refresh. A bubble carries **`↩ RQ-… · SERIAL`** and the supplier's name; the badge increments; clicking opens that room.

### RM3-AC-63 — no notice when you are already reading it [CORE]
*How to test:* Keep the chat open on that tab. On refresh no bubble appears and the badge does not increment.

### RM3-AC-64 — arrival copy never implies immediacy [CORE]
*How to test:* The headline reads like "you have a reply". **Fail on «رسالة جديدة الآن»** or any live-feed phrasing — the mechanism is a refresh, not a push.

### §6.8.5 — the bubble is suppressed while a side panel is open [EDGE]
*How to test:* With a detail open, a reply fires the transient popup rather than the dock bubble. **Accepted limitation — do not raise it.**

---

## 10 · The price footer

### RM3-AC-24 — the footer shows figures and hands off [CORE]
*How to test:* Compare rate, source line («عرض افتتاحي»), and the **التفاصيل** breakdown against the same bid's `/deal-room/[id]` — rate, units, periods, mobilisation, demobilisation, subtotal, VAT, total, and especially **duration in days** must match exactly. Negotiate/accept navigates to the existing flow, never a second negotiation UI here.

### §6.10 / V12 — التفاصيل expands in place [CORE]
*How to test:* The footer grows upward within the panel column, pushing the list — not floating over it. Pressing again returns it to resting height.

### V12 — the no-room case [EDGE]
*How to test:* A never-negotiated bid shows its own figures with no status line. Viewing creates no room; pressing negotiate does.

---

## 11 · The supplier's side

### RM3-AC-50 — the request renders as a card naming the exact machine [CORE, mobile]
*How to test:* The card shows thumbnail, name, **serial**, the `ref` (`RQ-7F3A`), the ask in words, and **«بانتظار ردّك»**. Rename the listing and reopen — the card shows the new name (resolved from `equipmentId`, never parsed from text).

### RM3-AC-51 — an availability card lands on that unit's yard sheet [CORE, mobile]
*How to test:* Tap **«حدّد الساحة»** — readiness opens **focused on that machine** with the yard sheet open, not an unscoped list. Save a yard; on the renter's side that machine turns green after refresh.

### RM3-AC-52 — a document card lands on that machine's upload for those types [CORE, mobile]
*How to test:* Request two types. They render as **chips**, never a count ("2 documents"). **«ارفع المستندات»** opens pre-filtered to exactly those two types on that machine. Upload one — the renter's row flips red→green and the group count drops.

### RM3-AC-53 — a deal room does not block yards or uploads [CORE, mobile]
*How to test:* With a room open, the yard control and upload controls are **enabled** and both save. Only a **count** change is refused, with the reason stated — never a silently dead control.

### RM3-AC-56 / RM3-AC-57 — the auto-reply, and only on success [CORE / EDGE, mobile]
*How to test:* Answer from the card — a reply card appears on both sides with the same `ref` and machine. Then force a failure (offline mid-save): the error surfaces and **no** reply card appears; the renter's card still reads waiting.

### RM3-AC-54 — the refusal round-trips [CORE, mobile] [SUPERSEDED]
*Superseded:* AC-54 says `resolution: 'declined'`. The owner ruled (2026-08-08) there is exactly **one** refusal and it is `unavailable`; `declined` is contract-legal but never offered and never emitted.

*How to test:* **«غير متوفّرة»** / **«لا أملكه»** emits `unavailable`. Sweep the supplier UI — no control may emit `declined`. The renter's card reads refused, not waiting.

### RM3-AC-55 / RM3-AC-58 — refusal vs derived state [CORE, web]
*How to test:* Refuse an availability request, then confirm the yard anyway. The card's **status** follows the machine (answered), while the refusal reply stays in the thread as the record. They must not be reconciled by deleting the message.

### RM3-AC-59 / RM3-AC-60 — "add a unit" is two steps [CORE, mobile]
*How to test:* **«أضف معدّة»** opens the add-equipment form; registering alone posts no reply and answers nothing. Then commit into a claimed slot on a 3-offered / 1-registered bid **with a room open** — the save must **succeed** and the offered count must still read **3** (now 2 registered + 1 claimed). If it silently drops, that is the padding-collapse defect — fail it.

### RM3-AC-61 — registering without committing changes nothing [CORE, web]
*How to test:* Register a qualifying machine without committing. The renter's shortfall is unchanged, the machine is absent from the list (`inBid: false`), no new marker. Commit it — the shortfall drops by one and it appears.

### SDR-AC-25 — the push names the machine and the ask [EDGE, mobile]
*How to test:* With the device locked, a request notification reads like «طلب تأكيد توفّر — رافعة شوكية FD25-31002», not "You have a new message".

### SDR-AC-24 / -26 — unread inflation [EDGE, backend]
*How to test:* A request increments the supplier's badge; a reply behaves like an ordinary message on the renter's side, not a doubled count.

### SDR-AC-02 / -28 / -29 — degraded states [EDGE, mobile]
*How to test:* (a) A request naming a machine he no longer owns falls back to plain text, never an empty bubble. (b) A withdrawn/rejected bid renders cards read-only. (c) Offline, card actions are disabled behind the standard banner, never silently inert.

### S6 — the supplier's bid card carries the pending request [EDGE, mobile]
*How to test:* Without opening the chat, the bid card's CTA reads **«حدّد الساحة»** / **«ارفع المستندات»** instead of «فتح غرفة الصفقة», and lands on the answering screen. With two unanswered requests, the **oldest** shows with a count. Accepted cost: a request arriving while he watches the list does not change the button until refresh.

---

## 12 · Readiness

### RM3-AC-27 — `locationSource` precedence; `yardConfirmed` reported, never rendered [CORE, backend]
*How to test:* In devtools inspect `GET /me/bids/{bidId}/fleet`. A confirmed machine reads `unit_yard`; one never confirmed but with a registered yard reads `listing_yard` (pin red). `yardConfirmed` is present but drives nothing. A machine confirmed on a **different** bid still reads unconfirmed here.

### RM3-AC-31 (readiness clause) — registered counts only `inBid === true` [CORE]
*How to test:* 8 owned / 5 offered / 3 backed → shortfall **2**. Counting all fleet rows would show 0.

### 004a §4.3 — counts are live until the room exists [EDGE]
*How to test:* With no room, the supplier adds a unit → the renter's pills and shortfall move on refresh. With a room, the count change is refused. No copy on the renter's surface may imply the numbers are fixed before the room exists.

### 004a §10 — ~~the accepted readiness divergence~~ the app is the source of the percentage [EDGE] [RULED 2026-08-12]

~~**Do not raise this as a bug** — web excludes proof of ownership from the fraction (`total = 1 + certs`), mobile includes it (`total = 2 + certs`), so the same machine reads 50% to the lessor and 100% to the renter.~~ **The acceptance is withdrawn.** Owner's ruling, 2026-08-12: *"for the percentage use existing bid readiness in the app as source of truth."* The standing rule applies — the app is the reference for shared logic, and the web changes.

**It was not fixed by flipping the constant**, because the exclusion's stated reason (*"the backend strips it from the renter's `offeredUnitsDetail`"*) is true of one input family and false of the other. Whether ownership is scored is now an explicit argument (`scoreOwnership` on `computeUnitReadiness`), **defaulting to `false`** — and the app already models both readings itself: `total`/`done` (`2 + certs`) for the supplier, `renteeTotal`/`renteeDone` (`1 + certs`) for the renter.

| surface | the data it reads | ownership in the fraction | denominator |
| --- | --- | --- | --- |
| **Map panel** — match grid, documents tab, equipment card, filter chips | fleet rows from `GET /marketplace/bids/{bidId}/fleet`, served **unstripped** by `supplier-fleet.service.ts` (owner, 2026-08-10) | **counted** — `scoreOwnership: true` at every call site | `2 + certs` |
| **Bid surfaces** — comparison workspace, bid-card badge, eligibility modal | `bid.offeredUnitsDetail`, stripped of `RENTEE_HIDDEN_DOC_TYPES` by `rentee.service.ts` | **not counted** — `computeBidReadiness` exposes no such option | `1 + certs` |

What remains between the two screens is a difference in the DATA each one holds, not two opinions about readiness.

*How to test:*
1. On the **map panel**, open a machine holding every requested certificate and both mandatory photos but **no** ownership paper. The ownership row is red **and the fraction is now short by exactly one** — with one requested certificate it reads **67%**, not the old green 100%. Add any one ownership paper (`istimara` · `customs` · `sale_contract` · `saso_registration` — the app's `kPooDocTypes`) and it reaches **100%**. That number now matches what the supplier's own app shows him for the same machine, which is the whole of the ruling.
2. On the **comparison workspace / bid-card badge / eligibility modal** for the same bid, the percentage is **unchanged** from before the ruling — ownership is not a scored key there. A supplier who has filed everything must still be able to reach 100% on the renter's bid surfaces.
3. Ownership appearing in a **bid** surface's fraction is a **fail**, not a stricter reading: the renter is never sent the paper, so it would be a shortfall no supplier could ever close.

### SDR-AC-15 → -19 — the mirror [EDGE, mobile]
*How to test:* If shipped, every row reads in the **renter's** vocabulary, a problem row states **«يظهر لديه بالأحمر»** *before* its button, fixable rows sort first, and no percentage or grade appears anywhere.

### SDR-AC-20 → -23 — the readiness gate [CORE, mobile]
*How to test:* With a room open: confirm a yard, swap the machine on a single-unit bid, upload a document and a photo — all four succeed. A count change is blocked with **«لا يمكن تغيير عدد الوحدات بعد بدء التفاوض»**. On a multi-unit bid mid-negotiation, an availability request naming a machine **not** in the bid disables the control **with its reason shown**. Reaching readiness from My Bids and from the deal room lands on the same section.

---

## 13 · Not covered by any AC

### Ownership papers reach the renter on the MAP only [CORE] [SUPERSEDED]
Owner ruling 2026-08-10. `RENTEE_HIDDEN_DOC_TYPES` is **back** in `rentee.service.ts` and strips istimara · customs · customs_card · sale_contract · sales_contract · saso_registration from the **bid's** projection, while `supplier-fleet.service` serves the map's rows **unstripped**.

*Superseded:* v2's **RMAP-AC-101/102/103** are overtaken — the filter is **scoped, not deleted**, and the row carries **view** only.

*How to test:* Ownership papers list and open on the verification surface's documents tab. On the **bids list / bid card / comparison** surfaces they are **not** exposed. In devtools, `GET /me/bids/{bidId}/fleet` carries them with urls; the bid's own payload does not.

### The wording ruling — «المورد», the prototype's word [CORE] [REVERSED 2026-08-10]
This surface previously said **«المؤجّر»** everywhere, deliberately and against the prototype. The owner reversed that on 2026-08-10: *"also use supplier always"*, alongside the prototype screenshots that spell the request button **«اطلب من المورد إرساله»**. So the prototype's word wins and the earlier ruling is void.

*How to test:* Sweep the surface in Arabic — header, pills, alert, list, detail, documents, both footer buttons, chat dock, price footer. Any **«المؤجّر»** in a string belonging to this surface is now the failure, the exact inverse of what this line used to say. The English is unaffected: it already said "supplier" throughout.

**Scope, so this is not over-applied:** the reversal covers THIS surface. Two strings elsewhere in `ar.ts` still say «المؤجّر» — a comment at :322 and `shareTeaserBody` at :392, which belongs to the share-link feature — and were deliberately left alone, because rewriting another feature's copy was not what was asked. If the word should change app-wide, that is a separate sweep.

### The active documents-footer button is navy `#1C3550` [EDGE]
*How to test:* The live footer button fills navy. The card-level **«اطلب التأكيد»** stays blue `#2563EB` — different controls, not to be unified. Does not reopen AC-33.

### The company batch download's CORS failure must be counted [EDGE]
*How to test:* Tick five and press. The panel reports how many landed. If fewer save, the shortfall is stated explicitly. A silent partial save is a fail.

### Equal card height and the preserved resting shadow [EDGE]
The manual halves of AC-32 and AC-35, which no node test can observe.

*How to test:* Every card is the same height regardless of confirmation state. The pre-selected card's resting shadow is preserved so it never appears to shift while pulsing.

### The off-platform deep link must not land on a load error [EDGE]
Recorded in TC-12: the previous guard tested `bid.viaSharedLink`, which the route's mapper never set.

*How to test:* Open `/bids/link-<id>/equipment` directly with a real off-platform bid id. It routes to the shared-bid viewer, not "this offer couldn't be loaded".
