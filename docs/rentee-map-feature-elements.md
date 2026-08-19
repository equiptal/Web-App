# Feature elements — renter's deal-room map

Everything the surface currently carries, grouped by **what it is about**, not by which component
draws it. Use it to decide where each thing belongs.

Sources: prototype `deal-room-rentee-map-v3.html` fixtures + spec 001.

---
# 0. the entry point of this view currently is the bid card of a specific supplier , clicking the card itself will open , and for multi item user already selecting a specific item then specific supplier bid before even reaching the map so this view is always per item per bid supplier 
## 1. The request (what the renter asked for)

`REQ-1043` · equipment type & size (`رافعة شوكية ٣ طن`) · quantity · duration in days ·
operator required (yes/no) · project location (lat/lng) · working days · working hours ·
night shift · local content · **item strip** when the RFQ has several items (each item is a
separate request with its own bids)
- will be removed in v3



## 2. The offer (one supplier's bid)

daily rate · mobilisation (موب) · demobilisation (ديموب) · whether mob/demob are included ·
overtime multiplier · **offered unit count** · offer validity (٧ أيام) · ETA to respond ·
status (new / negotiating / accepted) · deal-room existence
- will be removed , this new v3 is for verifcation focus 

## 3. Supplier profile

company name · initials avatar · **verified tick** · completed deals count · city ·
CR number · VAT number · national address · IBAN · contact info · **company documents**
- contact info - deals count - iban will be removed , this info will be retrieved from company profile full details and has all the company documents here with option to download / open / request any of the document 
- the header of the side panel will only show company name with verified tick and on click full profile with docs appear

## 4. Equipment identity

serial number *(the only true identifier)* · model · manufacturer · year · type & size ·
load capacity · fuel type · attachments · **photos** (front / plate / meter / side)
- load will be removed , on the equipment card on the left panel  we will show ditance, model , year , front image , if confirmed elgibility with bid readiness , and chips of avaialble docs like tuv , spsp, no nead to show serial on card, rentee can also request avaialablity confirmation here from the card 
- selecting an equipment card and be on specific equipment focus then all avaialble details and actual documents of the equipemnt will be shown with same options download / open / request 
- an option to request another is always visible on the equipments panel and also inside each equipment details 
- these above points for point 4, 5 and 6 also cover 9 for the entry point and places of these requets actions

## 5. Equipment verification — the core

| Element | Values |
|---|---|
| **Availability** | مؤكّدة / غير مؤكّدة — is the yard named for *this* bid |
| **Yard** | which yard it ships from |
| **Distance** | km from that yard to the project |
| **In the offer?** | `inBid` — offered, vs owned-but-not-offered |
| **Fit vs request** | per attribute: type, year, fuel, load, attachments, certificate |
| **Certificate on file** | yes/no |
| **Readiness** | does it hold what the request asked for (photos + requested certs) |

## 6. Equipment documents

الاستمارة · التأمين · رخصة التشغيل · البيان الجمركي · شهادة ساسو · شهادة السلامة (TÜV/SPSP)

Per document: **state** (موثّقة / مُقرّة / ناقصة / مؤجّلة باتفاق) · expiry · who asked for it ·
view · download · **request it**
- no status here for the equipment 

## 7. Offer composition — offered vs reality

offered count · registered machines · confirmed · not confirmed ·
**claimed** (offered but no machine registered — has no location and cannot be inspected) ·
alternatives he owns but did not offer

## 8. Location & map

project pin · machine pins (green/red) · yard names · distance per machine ·
distance filter (الكل / ≤٥٠ / ≤١٠٠ / ≤٢٠٠ كم) · location source precedence ·
"location not shared" for offers that cannot be plotted · colour key

## 9. Requests to the supplier

Three kinds, each bound to one `equipmentId`, delivered as structured chat cards:

**اطلب تأكيد التوفّر** · **اطلب معدّة أخرى** · **اطلب مستنداً**

Card carries: `ref` · `kind` · `equipmentId` · `serial` · `docTypes[]`
Reply carries: `inReplyTo` · `equipmentId` · `resolution` (provided / declined / unavailable)
Card state is **derived**, never stored — re-read the machine on every render.

## 10. Chat

messages · attachments (view + save) · unread badge · **per-item tabs** when one supplier bid on
several items · notifications while on the map · new-bid arrival · pre-composed unsent request cards

## 11. Price & negotiation

hero rate · per-unit vs all-units · negotiation rounds · whose turn · previous offer struck through ·
agreed price · VAT (١٥٪) · duration & frequency · mob/demob inclusion · estimated total ·
breakdown · accept / counter / withdraw

## 12. Terms (~18, negotiated separately from price)

**Categories:** price · operator · work · equipment · payment
**Types:** priced · negotiable · acknowledge-only · info
**State:** open / agreed, with the agreed value

Examples: operator included · operator food · operator accommodation & transport · overtime ·
fuel responsibility · maintenance · breakdown response SLA · night shift · subletting ·
payment terms · fulfilment type

## 13. Quotation

quotation reference · issue date · validity · language · line items · PDF download · reopen
 - for 11 , 12 , 13 , price will be shown in the bottom of the left panel with option to expand details breakdown , and clicking request lower will open the same exisitng 3 style sheet of exisitng one 
## 14. Off-platform submissions

Offers that arrived outside the platform. **Never plotted — no coordinates ever.**

quotation ref · created / valid-until · CR · VAT number · city (instead of distance) ·
contact info · price **with or without VAT** (flagged) · submitted documents · equipment info if any ·
read-only price bar · "view submission" instead of chat/equipment
- removed completelty , these bids doenst have this equipemtnev map verification view 
---

## Where these live — v2 → v3

**No element was added or removed between the two.** Same data, same fields, same fixtures — the
only change is *which surface renders which area*. Verified by diffing the recovered sources:
**6 edit sites, 2 new components, 0 deletions.**

| # | Area | v2 — where it lives | v3 — where it lives |
|---|---|---|---|
| 1 | Request | top bar + item strip | **same** |
| 2 | Offer | offers panel, always on screen | offers panel **until a supplier is picked**, then behind `›` |
| 3 | Supplier profile | offers panel row + supplier modal | panel **header** + supplier modal |
| 4 | Equipment identity | machine drawer only | **panel cards** + drawer |
| 5 | Equipment verification | pin colour + drawer | **panel cards** + pin + drawer |
| 6 | Equipment documents | drawer tabs | **same** (drawer tabs) |
| 7 | Offer composition | map box **and** drawer header | **panel header only** — map box removed |
| 8 | Location & map | map + filter in offers panel | **same**, filter moves out of view with the offers list |
| 9 | Requests to supplier | drawer actions + generic «اطلب معدّة أخرى» | **same, plus per-machine ask** from a `خارج العرض` card |
| 10 | Chat | chat drawer | **same** |
| 11 | Price & negotiation | price bar | **same** |
| 12 | Terms | quotation/terms panels | **same** |
| 13 | Quotation | quote modal | **same** |
| 14 | Off-platform | submission modal + read-only bar | **same** |

### The exact v3 delta

| Change | Effect |
|---|---|
| `guideEl: rBidsPanel()` → `rEquipPanel()` | the floating panel changes subject once a supplier is selected |
| new `rEquipPanel()` | panel chrome: supplier header, `›` back, composition bar, colour key |
| new `rEquipCards()` | one card per machine — offered ones open the drawer, `خارج العرض` ones offer an `alternative` request |
| `selSup = 0` at start | opens already scoped to a supplier instead of on the offers list |
| map composition box gated off | it duplicated the panel header and rendered on top of it |
| `rUnitSwitch()` suppressed | the cards are the machine navigation now |
| tour suppressed | it narrated a rail this layout no longer leads with |

**What v3 costs:** the offers list stops being persistently visible, which is a documented 001 §6.2
rule. Everything else is a re-home, not a change.

## Known overlaps to resolve

1. **Offer composition (7)** appears in the panel header *and* used to appear on the map — the map
   copy was removed in v3. Make sure it has exactly one home.
2. **Availability (5)** shows on the pin, the card, the drawer header and the colour key — four
   places, one fact.
3. **Company documents (3)** vs **equipment documents (6)** — spec 001 puts both in the machine
   drawer as tabs; an older rule put company documents on the supplier row. Pick one.
4. **Distance (5/8)** is a machine property but is also summarised per offer in the bid row.
5. **Certificate on file (5)** overlaps with **safety certificate (6)** — the same fact expressed as
   a machine attribute and as a document.
