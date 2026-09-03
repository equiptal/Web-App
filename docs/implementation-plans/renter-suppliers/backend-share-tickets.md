# Sharing a request — the two backend tickets

**For the backend developer.** Everything on the web side is built, deployed and green: the template,
the card, the channel picker, the recipients, the preview. These two are what is left, and neither is
reachable from the browser.

Measured against staging on **2026-09-03**, not inferred. Commands and responses are included so you
can re-run them.

---

## The one constraint behind both tickets

The web app never sends an e-mail. It opens the renter's own webmail by putting a URL in the browser:

```
https://outlook.office.com/mail/deeplink/compose?subject=…&body=…
https://mail.google.com/mail/?view=cm&fs=1&su=…&body=…&bcc=…
```

Everything after `?` is a **query string** — characters, with no MIME type. So:

| | |
| --- | --- |
| HTML in the body | **impossible.** `<table>` arrives as the literal characters `<table>` |
| Blind copies in Outlook | **impossible.** Its deeplink documents `to`, `subject`, `body` and discards `bcc` silently |
| A card built from the link | only where the CLIENT fetches the URL — WhatsApp does, Gmail never does |

Both tickets exist to step out of that doorway.

---

# SUP-BE-24 — the shared link unfurls a picture of nothing

**One line. Highest value on the board. No dependencies.**

## What happens today

The link a renter shares points at the OS app, which is correct and deliberate
(`NEXT_PUBLIC_OS_APP_URL`; c-hub shares the same link). So the card every supplier sees is built
from **the OS app's** Open Graph tags.

Fetched for a real request:

```
$ curl -sL https://web-production-de3c8.up.railway.app/bid/a319541b-9762-43dd-a3d2-030bf3a3850d \
    | grep -i 'og:'

og:title        CEX-020902 — إيجار حفار، وحدتان
og:description  QFC4+RX Diriyah Saudi Arabia · إيجار 121 يومًا · بانتظار ردّك
og:image        https://webstaging.moedatech.net/og-bid.png      ← a CONSTANT
```

`og:image` is the same 19 KB navy rectangle with the logo on it — **for every request ever shared.**
No equipment, no call to bid. A supplier scanning WhatsApp sees a brand mark and an Arabic one-liner.

## The fix

```ts
// apps/backend-agents/src/handlers/agents/bid-form/getBidFormPreview.ts:94
- export const previewImageUrl = () => `${WEB_APP_URL}/og-bid.png`;
+ export const previewImageUrl = (linkKey: string, lang: "en" | "ar") =>
+   `${WEB_APP_URL}/bid/${linkKey}/og${lang === "ar" ? "?lang=ar" : ""}`;
```

and at the one call site, **line 441**, passing `linkKey` and the resolved `lang`. The existing test at
`bid-form-preview.test.ts:106` takes the same arguments.

### ⚠️ Two corrections to an earlier draft of this ticket — both found by the backend dev, both verified

**`lang` is not optional.** The two endpoints have **opposite defaults**: this one answers Arabic
unless `?lang=en` opts out, and the image route answers English unless `?lang=ar` asks
(`src/app/bid/[token]/og/route.tsx:73`). Measured: no parameter and `?lang=en` return the identical
36,934-byte render; `?lang=ar` a different one. So a version without `lang` ships an **English picture
above an Arabic description**.

**`linkKey`, not `token`.** `token` is the raw path parameter; `resolveGroup` returns
`linkKey = reqs[0].requestGroupId ?? token`, and the `url` field on the same response already uses it.
On a back-compat link whose token is a single request id, using `token` here puts the request id in
the image URL and the group id in `url` — two ids for one card. Both render real content, so it is
inconsistency rather than breakage, but there is no reason to ship it.

## Nothing needs to be rendered

That route is already live and answering:

```
$ curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" \
    https://webstaging.moedatech.net/bid/<uuid>/og

200 image/png 40030
```

1200 × 630. It draws the mark, the equipment (`Crawler Excavator 20 ton · with operator ×2`, or
`+ 2 other equipment items` when there are several) and the call to bid. `?lang=ar` for Arabic.

## Why it is safe

- **Nothing is stored.** `previewImageUrl()` is called in the response builder (line 441), so **every
  request that already exists** gets the card the moment this deploys. No migration, no backfill.
- **No link changes.** Links already shared keep working and start unfurling properly.
- **No web deploy.** Nothing in this repo changes.
- **No OS deploy — for the IMAGE.** The OS calls this endpoint server-side on every render, so it
  picks up the new `imageUrl` without being rebuilt. ⚠️ **Not true for declaring the image** — see
  the corrected item below.
- **One service deploys:** `agents-equipment`, which is where this handler now lives after the
  refactor moved it out of the legacy agents config.
- Worst case if wrong: the card falls back to what it shows today.

## Two smaller things — and neither is what the first draft claimed

1. ~~**A richer `og:description`.**~~ **Withdrawn, and the reasoning behind it was wrong twice.**

   It is not "same file, same deploy": it needs term columns that are not in `PREVIEW_SELECT`, plus
   the same edit again in backend-admin's contract-pinned `buildBidCardCopy` mirror. And the
   receiving surface already builds a better one from the full `getBidForm` payload.

   The clamp claim was backwards. `bidCardModel.ts:407` says it plainly: *"WhatsApp gives a
   description about two lines, and the backend's own copy clamps at 160, so the tail was being cut
   by the client."* **200 is the WEB's figure, chosen because that description is the only prose our
   card carries. 160 here is deliberate.** Leave it.
2. **Declare the image** — `og:image:width` 1200, `og:image:height` 630, `og:image:type` `image/png`.
   An unfurler that must fetch the picture just to measure it sometimes times out and draws a
   text-only card; LinkedIn is strictest, WhatsApp and Outlook both render sooner with them present.

   ⚠️ **This is two jobs, and the earlier draft said one.** These are `<head>` tags the **OS page**
   writes; this endpoint returns JSON and cannot emit them. The backend's half is supplying the
   numbers — `imageWidth` / `imageHeight` / `imageType` on the response, done — and **the OS must
   then read them and write the tags.** So this item does need an OS deploy, even though the image
   itself does not.

## Fixed in passing — the city parser

The sample above reads `QFC4+RX Diriyah Saudi Arabia · …`. That is not a city.
`cityFromAddressLabel` matched a whole comma segment against the country list, so a **comma-less**
label — which is what a plus-code pin returns — came back entire, country and all. A country-only
label now yields no city instead of "Saudi Arabia".

Found inside this ticket's own measured output, and not noticed when it was written.

## One thing to check, not necessarily to fix

`GET /bid/<uuid>` on the OS host answers **307**, redirecting to `/ar/bid/<uuid>` — so it also forces
Arabic whatever the renter's language. Most unfurl bots follow redirects; not all. If the card is
still missing after the image fix, this is the next thing to rule out.

## Done when

A renter pastes a shared link into WhatsApp and sees the equipment and the call to bid — not the logo.

---

# SUP-BE-23 — a share e-mail that carries the card, from the renter's own address

**Solves two things at once: the missing card in Gmail, and blind copies in Outlook.**

## The two symptoms

**Gmail never shows a card.** Not a format problem — its composer simply does not fetch a pasted URL.
Nothing we put in `body=` can change that, because `body=` is text. The only ways in are a manual
Ctrl+V of HTML, or us sending the message.

**Outlook drops the recipients.** Measured 2026-09-02: a send with `bcc=` produced a compose window
addressed to nobody, while the identical call to Gmail's `view=cm&bcc=` carried them. Microsoft's
deeplink documents `to`, `subject`, `body` and ignores what it does not recognise, with no error.

Today the web works around both: the compose window opens with the message as words, and the
clipboard carries **the one thing that provider cannot supply** — the addresses for Outlook, the card
for Gmail — with one instruction on screen. It works, and it costs the renter a paste.

## What to build

```
POST /agents/requests/{requestId}/share-email
```

```jsonc
{
  "supplierIds": ["4e7d556a-…", "7ddb7373-…"],   // for the share record
  "to":       [],                                 // usually empty
  "bcc":      ["ops@alfaisal.sa", "rfq@najd.sa"],
  "subject":  "RFQ for Crawler Excavator 20 ton · with operator ×2",
  "html":     "<div>…greeting, card, points, sign-off, link…</div>",
  "text":     "Hello,\n\nShibh Al Jazira invites you…",   // the text/plain alternative
  "replyTo":  "bandar@zahid.sa"
}
```

**The web already produces every field.** `shareMessageHtml` in `src/lib/copyShareMessage.ts` renders
the HTML (greeting → card → points → sign-off → link, tables and inline styles only, Outlook-safe);
`renderShareMessage` in `src/lib/shareTemplate.ts` renders the text alternative. Recording is the same
call the panel already makes for every share.

## Whose address is on it — the decision this ticket is blocked on

The owner has ruled: **from the renter's own address**, and **no configuration by the renter**, and
**no configuration by his IT**. All three together are not achievable — putting `bandar@zahid.sa` in a
From line requires proving we may, and there are exactly two proofs: control of the domain, or access
to the mailbox. Anything else fails SPF/DKIM and lands in spam.

So one of the three has to give. The options, honestly costed:

### Option A — OAuth, we write a draft into his own mailbox

He presses **Connect my e-mail** once. From then on we create a finished HTML draft in his Drafts; he
opens it, reads it, sends it. His address, his Sent folder, full card, real Bcc, no paste.

- **Microsoft Graph** — `POST /me/messages` with `body.contentType: "HTML"` and `bccRecipients`,
  scope `Mail.ReadWrite` (or `Mail.Send` to send outright). Free, ordinary consent. ⚠️ Many
  Microsoft 365 tenants disable user consent for third-party apps; those renters see *"ask your
  admin"* and cannot proceed, and you cannot tell which in advance.
- **Gmail API** — `users.drafts.create` (or `users.messages.send`) with a base64url MIME body.
  ⚠️ **`gmail.send` is a *sensitive* scope, not restricted** — standard Google brand verification,
  **no CASA audit**. (`gmail.compose` and `gmail.readonly` are the restricted ones. An earlier note in
  this repo claimed otherwise; it was wrong.) No admin wall on Google's side.

**Breaks:** "no renter configuration" — by exactly one click, once, ever.

### Option B — verified domain, we send it ourselves

His company adds **one DNS record**. SES then sends legitimately as `bandar@zahid.sa`. Real card, real
Bcc, no paste, and nothing for any renter to click. Also gives delivery and bounce reporting, which
the compose window can never provide.

`sendEmail({ to, subject, html, from })` already exists at
`apps/backend-agents/src/external/aws/ses.service.ts` — it takes `html` today.

**Breaks:** "no IT configuration", and it is per company, so a renter on a personal `@gmail.com` can
never use it. And the mail never passes through his mailbox, so it is **not in his Sent folder** —
BCC him a copy if that matters.

### Option C — we send from our address, replies go to him

`From: Shibh Al Jazira via Moedatech <notifications@moedatech.net>`, `Reply-To: bandar@zahid.sa`.
Nothing to configure by anyone, works for every renter, deliverability improves. What DocuSign and
Calendly do.

**Breaks:** "from his own address" — explicitly rejected by the owner.

## Recommendation

**A, Microsoft first.** It is free, needs no audit, and closes both Outlook complaints — the card and
the Bcc — in one build. Google second, now that the scope is known to be cheap. Keep the paste as the
fallback for anyone who does not connect; nothing regresses for them.

**Token storage: key it `(renterId, provider)`, not `renterId`.** A renter may connect Outlook today
and Gmail next month, and both must survive. Written carelessly this becomes one column and the second
connection silently replaces the first.

Whichever option is chosen, also handle: expiry, revocation, and a reconnect path — a token that dies
quietly must degrade to today's compose-window behaviour, never to a failed send with no explanation.

## Done when

A renter presses Send with E-mail chosen and a message **with the card in it** reaches his suppliers
in blind copy, from his own address, with nothing pasted.

---

## What the web side already provides, for both tickets

| | |
| --- | --- |
| `src/app/bid/[token]/og/route.tsx` | the 1200 × 630 card image, live, public, `?lang=ar` |
| `src/lib/bidCardModel.ts` | one model behind the image, the HTML and the text |
| `src/lib/bidCardHtml.ts` | the card as Outlook-safe HTML |
| `src/lib/copyShareMessage.ts` | `shareMessageHtml` — the whole message as HTML |
| `src/lib/shareTemplate.ts` | `renderShareMessage` — the same message as text |
| `src/lib/bidCardModel.ts` | `bidCardDescription` — the clamped `og:description` |

Nothing in this list needs changing for either ticket.
