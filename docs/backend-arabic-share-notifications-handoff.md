# Backend: Arabic machine name on the share form, and Arabic notifications

**From:** the renter web app, 2026-10-05
**Source:** the staging issues report of 5 Oct 2026 (item W4), captured on https://webstaging.moedatech.net

Two issues. Both are in Arabic only; English is correct in both.

| # | Issue | Service | Priority |
|---|---|---|---|
| 1 | The share form's Arabic machine name drops the subtype («حفار» instead of «حفار جنزير») | Agents backend, `GET /public/bid-form/{token}` | **High** |
| 2 | Some notifications come back in English when Arabic is asked for | App backend, `GET /notifications/me?language=ar` | Low |

A third item from the same report, the Arabic words in the wrong order on the share image, was first
thought to be backend. It is **not**: it is the web app's own image route, and the web will fix it.

---

## 1. Arabic machine name loses the subtype (High)

### What the supplier sees

A renter asks for a **crawler excavator, 20 ton, with operator** (RFQ-00209). They press
«مشاركة الطلب» (Share request). The supplier receives on WhatsApp or e-mail:

> حفار 20 طن · مع مشغّل

That is "excavator 20 ton", not "**crawler** excavator 20 ton". In English the same message reads
"Crawler Excavator 20 ton", which is correct.

### Why it matters

It is wrong information, not just wrong wording. Crawler and wheeled excavators are different
machines at different prices, so a supplier reading «حفار» can quote the wrong one. Every Arabic share
carries the name: the WhatsApp text, the e-mail, and the share image headline.

### Where it comes from

1. The web calls `GET {AGENTS_API_URL}/public/bid-form/{token}` (public, no auth).
2. Each entry in `items[]` carries the machine name in two languages:
   - `label`: `"Crawler Excavator"`, the subtype
   - `labelAr`: `"حفار"`, which looks like the **category's** Arabic name, not the subtype's
3. The web prints `labelAr` as it arrives (`src/lib/bidCardModel.ts`, `itemLabel`). It does not build
   the name itself.

### Asked change

`items[].labelAr` should be the Arabic name of the **same level** as `label`: the subtype when there is
one («حفار جنزير»), and the category only when the item has no subtype. Same rule for `sizeAr` against
`size`, if it has the same mismatch.

### How to check

| Request item | `label` | `labelAr` today | `labelAr` expected |
|---|---|---|---|
| Crawler Excavator, 20 ton | Crawler Excavator | حفار | حفار جنزير |
| Any other item with a subtype | its subtype | (check) | the subtype's own Arabic name |
| An item with a category only, no subtype | the category | the category's Arabic | unchanged |

Open RFQ-00209's share link with `?lang=ar`: the machine name at the top should read «حفار جنزير 20 طن».

⚠️ The `labelAr` value above is from the report's capture. The web team did not read RFQ-00209's
payload directly; please confirm against the response before changing anything.

---

## 2. Notifications in English on an Arabic screen (Low)

### What the renter sees

With the app in Arabic, the notification bell shows these in English:

- «New off-platform bid … submitted a bid via your public link. This supplier may not be a Moedatech member.»
- «Your request was closed»
- «New join request»

### Where it comes from

1. The web's bell calls its own route, which calls the app backend:
   `GET /notifications/me?page=1&filter=all&language=ar`
   (`src/app/api/me/notifications/route.ts`; `language` is `ar` whenever the UI is Arabic).
2. The web shows `title` and `body` exactly as they arrive; it does not translate them.

So `language=ar` is being sent, and these notification types answer in English anyway. They most
likely have no Arabic template.

### Asked change

Give these three notification types an Arabic `title` and `body`, the way the other types already
have. Suggested wording:

| Type | Arabic title | Arabic body |
|---|---|---|
| New off-platform bid | عرض جديد من خارج التطبيق | قدّم {supplier} عرضًا عبر رابطك العام. قد لا يكون هذا المورّد مسجّلًا في معداتك |
| Request closed | أُغلق طلبك | (as the English body, translated) |
| New join request | طلب انضمام جديد | (as the English body, translated) |

Wording is a suggestion; the product owner has the final say.

### How to check

Call `GET /notifications/me?language=ar` for a renter who has one of each type. All three come back
with Arabic `title` and `body`.

---

## Not part of this document

- **W5**, off-platform bids reaching the renter 15 to 20 minutes late, is a separate change request.
- The agent's English recommendation reason and the Arabic operator, generator and fuel misses are in
  `normalization-agent-operator-handoff.md`, for the Normalization Agent.
