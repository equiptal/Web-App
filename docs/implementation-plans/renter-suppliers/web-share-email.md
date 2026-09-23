# Sharing a request by e-mail: what the web has to build

Backend side of SUP-BE-23 and SUP-BE-24 is deployed to staging and green
(run `33959584193`). Nothing in this document is waiting on the backend.

Until the web calls these routes, nothing changes for anyone: the compose window
carries on exactly as today.

---

## 1. Why this exists, in one paragraph

The web cannot send mail. It opens the renter's webmail with a URL, and a query
string is characters with no MIME type. Two things follow, and they are the two
complaints:

- `body=` can only be text, so the card can never be in the message body. Gmail
  does not fetch a pasted link either, so a supplier reading in Gmail sees a bare
  URL whatever the renter used to send it.
- Outlook's compose deeplink documents `to`, `subject` and `body` and silently
  discards `bcc`. Measured on a real send: the recipients never appeared, while
  the identical call to Gmail's `view=cm&bcc=` carried them.

Both have one cure: something server side has to put the message on the wire.
That is `POST /agents/requests/{id}/share-email`.

---

## 2. The one call to add

```
POST /agents/requests/{id}/share-email
Authorization: Bearer <agents service token>
```

`{id}` may be a `requestGroupId` or a single request id. It must belong to the
caller's firm, or the route answers 404.

```jsonc
{
  "userId": 7,                                  // the renter
  "renterSupplierIds": ["4e7d556a…", "7ddb7373…"],
  "subject": "RFQ for Crawler Excavator 20 ton",
  "html": "<div>…greeting, card, points, sign-off, link…</div>",
  "text": "Hello,\n\nShibh Al Jazira invites you…"
}
```

**The web already produces every field.** `shareMessageHtml` in
`src/lib/copyShareMessage.ts` renders the HTML, `renderShareMessage` in
`src/lib/shareTemplate.ts` renders the text alternative. No new content work.

Three notes on the payload:

- `supplierIds` is accepted as an alias for `renterSupplierIds`, so whichever
  name the panel already uses is fine.
- `to`, `bcc` and `replyTo` are accepted and **ignored**. Keep sending them if
  that is easier; nothing breaks. Section 6 says why they are ignored.
- `html` is capped at 512 KB. A message over that answers 400.

---

## 3. Branch on `sent`, never on the HTTP status

**Every outcome that is not a malformed request answers 200.** A domain we cannot
send as, a renter who has not connected, a supplier with no address: all of them
are `200` with `sent: false`. A 4xx would make "not set up yet" indistinguishable
from "your request is malformed", and the fallback would then depend on catching
an error rather than reading a field.

### `sent: true`

```jsonc
{
  "sent": true,
  "from": "bandar@zahid.sa",
  "via": "graph",          // or "ses"
  "messageId": null,       // a string on the "ses" path, null on "graph"
  "inSentFolder": true,    // true only on "graph"
  "recipients": 2,
  "recorded": 2,
  "skipped": 1             // present only when some picked supplier was unusable
}
```

Show a confirmation naming the address it went from. When `inSentFolder` is true
you can say the copy is in their Sent folder, which is worth saying because it is
the thing the compose window used to give them.

`skipped` appears only when a picked supplier had no usable address, or an id was
not this firm's. Worth surfacing quietly: "2 sent, 1 skipped (no e-mail address)".

### `sent: false`

```jsonc
{
  "sent": false,
  "reason": "NOT_CONNECTED",
  "from": "bandar@zahid.sa",
  "domain": "zahid.sa",
  "state": "unverified",
  "dns": [ { "type": "CNAME", "name": "…", "value": "…" } ],
  "connectPath": "/agents/mail-connect/authorize"
}
```

| `reason` | What it means | What to show |
|---|---|---|
| `NOT_CONNECTED` | The renter has not connected Outlook | compose window **plus a Connect Outlook button** |
| `RECONNECT_REQUIRED` | The stored token was rejected and has been dropped | same, worded as "reconnect" |
| `NOT_CONFIGURED` | This stage has no app registration | compose window, **no button** (`connectPath` is null) |
| `DOMAIN_NOT_VERIFIED` | Nobody connected, and the domain's DNS records are not live | compose window; optionally offer `dns` for their IT |
| `PERSONAL_DOMAIN` | A free-mail address such as `@gmail.com`, which can never be verified | compose window only, `dns` is empty |
| `NO_SENDER_ADDRESS` | The account carries no e-mail at all | compose window; prompt them to add one to their profile |
| `NO_RECIPIENTS` | No picked supplier has a usable address | say so; sending would have been empty |
| `SEND_REJECTED` | Graph refused the message, usually consent revoked mid-flight | compose window plus reconnect |

Only `NOT_CONFIGURED` and the domain reasons have no Connect button. Use
`connectPath` being null as the test rather than listing reasons in the web.

---

## 4. The Connect Outlook button

### Start

```
GET /agents/mail-connect/authorize?userId=7&returnTo=<the panel's URL>
```

```jsonc
{ "available": true, "provider": "microsoft", "url": "https://login.microsoftonline.com/…" }
```

Open `url`, either as a redirect or a popup. `available: false` with
`reason: "NOT_CONFIGURED"` means this stage has no Azure app registration, so the
button must not be shown at all.

`returnTo` is checked against a host allow-list on the backend. An off-domain URL
is refused and the renter lands on a plain page on the API host instead, so pass
a real product URL.

### Come back

Microsoft returns the browser to the backend, which redirects to your `returnTo`
with one word appended:

```
…?mailConnect=connected | denied | unavailable | error
```

- `connected`: refetch status, then let them press Send again.
- `denied`: the renter refused, **or their Microsoft tenant blocks third party
  apps**. That second case is common in large firms and there is no way to detect
  it in advance. Word it as "consent was not granted, your organisation may need
  an administrator to approve it" rather than as a failure on their part.
- `unavailable` / `error`: keep the compose window.

### Show the state

```
GET /agents/mail-connect/status?userId=7
```

```jsonc
{ "configured": true, "connected": true, "provider": "microsoft",
  "accountEmail": "bandar@zahid.sa", "connectedAt": "2026-09-04T08:11:00.000Z" }
```

`configured` and `connected` are two different facts. `configured: false` means
the stage has no app registration, so offer nothing. `connected: false` with
`configured: true` is a renter who simply has not connected yet.

### Disconnect

```
DELETE /agents/mail-connect?userId=7
```

Answers `{ "connected": false, "revokedAtProvider": false }`. It deletes our
stored token. Only the renter can revoke the grant on Microsoft's side, so do not
word the button as revoking access, and do not claim we removed it there.

---

## 5. The trap: do not record the share twice

The panel today calls `POST /agents/requests/{id}/shares` after opening the
compose window. That route records what the renter **says** they sent from their
own client; its field is `declaredAt` and it is deliberately not evidence.

`share-email` records the send itself, with the engine that sent it. So:

- `sent: true` → **do not** call `POST /shares`. It is already recorded.
- `sent: false` → open the compose window and call `POST /shares` as today.

Calling both files one send twice, and the second copy claims a declaration that
never happened.

---

## 6. Why `bcc` from the payload is ignored

Once a renter is connected, this endpoint puts their own address in a `From`
line. An arbitrary recipient list would therefore let anyone holding the service
token send mail to anybody as a real company. The addresses are derived on the
backend from the supplier rows the renter owns, so a supplier they have not added
cannot be written to at all.

Practical consequence for the UI: **the picker is the recipient list.** There is
no way to type an ad hoc address into a share. If that is ever wanted it is a
deliberate backend change, not a payload field.

The renter is always among the recipients, so they keep a copy either way.

---

## 7. What does not change

- the card HTML (`bidCardHtml.ts`) and the message template
- the recipient picker
- the copy-for-Bcc control, which stays for the compose-window path
- the shared link and its unfurl card

On that last point: SUP-BE-24 shipped, so a shared link now unfurls with the
equipment, the reference and the call to bid instead of one constant logo image.
That works in Outlook and Apple Mail with no web change. It does not work in
Gmail, which does not unfurl links at all, which is the other half of why the
card has to be in the body.

---

## 8. Prerequisite, and what it does not block

`/agents/mail-connect/authorize` answers `NOT_CONFIGURED` until an Azure app
registration exists and its client id and secret are in SSM. Two settings on that
registration decide whether it works, and both fail in a way that looks fine:

- **Supported account types must be multi-tenant.** The default is single tenant,
  which admits only `@moedatech.net` accounts. It would test perfectly and refuse
  every real renter.
- **`offline_access` must be in the delegated permissions**, or the token expires
  in about an hour and the renter re-consents on every send.

You can build and ship every part of section 3 before that exists. The endpoint
answers `NOT_CONFIGURED`, the button stays hidden, and the compose window carries
on. Nothing regresses.

---

## 9. Not built, deliberately

**Reading the renter's Outlook mail in the web.** It is possible with no schema
change (fetch live from Graph per view, store nothing), but it needs `Mail.Read`,
whose consent screen reads "Read your mail" and which grants the entire mailbox.
There is no per thread scope. Bundling it into this consent would depress the
connection rate for the send, which is the feature that was actually asked for.

If it is wanted, it should be a second, separate click, asked only of renters who
want it, and scoped to supplier replies on shares they sent rather than to an
inbox.
