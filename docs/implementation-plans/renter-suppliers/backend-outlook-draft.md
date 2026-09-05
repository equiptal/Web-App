# SUP-BE-26 — Outlook: draft it, do not send it

**One change, and everything else in the feature already fits around it.** The web is built and
waiting; nothing here is blocked on the web side.

Owner, 2026-09-05:

> *"when user select suppliers and was selecting email and click post it must open for him the
> connector and choose his account then open the outlook for him and see who is bcc then click send
> so he send it by him self"*
> *"make sure he can see the bcc emails"*

---

## 1. What happens today, and why it does not answer that

`renter-mail-oauth.service.ts:414`, `sendViaGraph`:

```ts
await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { … })
```

The message **leaves immediately**. There is no draft, nothing opens, and the renter never sees a
single recipient. He presses Send and is told a number.

That is not a bug in what was built. `Mail.Send` was chosen deliberately, and the reasoning in that
file is sound: the consent screen reads *"Send mail as you"* rather than *"Read and write your
mail"*. This ticket trades that smaller consent for the renter actually seeing who he is writing to
and pressing Send himself.

⚠️ **That trade is the owner's call and it has already been made.** Do not re-litigate it in code
review; raise it with him if it needs revisiting.

---

## 2. The change

### 2.1 Create a draft instead of sending

Replace the `sendMail` call with a **draft create**:

```
POST https://graph.microsoft.com/v1.0/me/messages
Authorization: Bearer <access token>
Content-Type: application/json
```

```jsonc
{
  "subject": "RFQ for Crawler Excavator 20 ton",
  "body": { "contentType": "HTML", "content": "<div>…</div>" },
  "bccRecipients": [
    { "emailAddress": { "address": "rfq@najd.sa" } },
    { "emailAddress": { "address": "ops@alfaisal.sa" } }
  ]
}
```

Answers **201** with the created message, which carries `id` and **`webLink`**.

Two things that were true of the send and stay true here:

- ⚠️ **No `from`.** Graph uses the authenticated mailbox. Naming a `from` needs send-as rights and
  fails on an ordinary account. The mailbox being the sender is the whole point of this path.
- ⚠️ **No plain-text twin.** `message.body` takes ONE `contentType`. Outlook generates the fallback
  itself. A real difference from the SES path, and not a new one.

`saveToSentItems` no longer applies: a draft is not sent, so there is nothing to save. It lands in
his **Drafts**, and in his **Sent** once he presses Send, which is better than either.

### 2.2 Return the link

`sent: true` gains one field:

```jsonc
{
  "sent": true,
  "from": "bandar@zahid.sa",
  "via": "graph",
  "messageId": null,
  "inSentFolder": false,      // ⚠️ false now: he has not sent it yet
  "draftUrl": "https://outlook.office.com/mail/deeplink/…",
  "recipients": 3,
  "recorded": 3
}
```

⚠️ **`inSentFolder` must become `false` on this path.** The web prints *"A copy is in your Sent
folder"* off it, and on a draft that sentence is a lie that sends him hunting for something that is
not there.

### 2.3 Scopes

`renter-mail-oauth.service.ts:183`:

```diff
-const MS_SCOPES = ['offline_access', 'openid', 'email', 'User.Read', 'Mail.Send'];
+const MS_SCOPES = ['offline_access', 'openid', 'email', 'User.Read', 'Mail.ReadWrite'];
```

`Mail.ReadWrite` is what creating a draft needs. `Mail.Send` is not required, because the renter
presses Send in Outlook himself.

🔴 **Every already-connected renter must re-consent.** A stored refresh token carries the scopes it
was granted with, so an existing token cannot create a draft: Graph answers **403
`ErrorAccessDenied`**. Handle it rather than letting it surface as a failed share:

- on 403 from the draft create, **drop the stored token** and answer `sent: false` with
  `reason: "RECONNECT_REQUIRED"` and the `connectPath`.
- The web already draws a **Reconnect Outlook** button on that reason. There is a test pinning it.

---

## 3. What the web already does

**Nothing on the web is waiting on you, and nothing there needs changing when this ships.**

- `ShareEmailResult` carries `draftUrl`, typed and parsed, null-safe.
- On `sent: true` with a `draftUrl`, the panel opens it in a new tab.
- On `sent: true` **without** one, it opens nothing, which is correct for today's send.
- The consent flow already runs inside the Send press: post the request, open the Microsoft window,
  wait for it to close, re-read status, then call this endpoint.
- The connector is gated to Outlook. Gmail never sees it, because Gmail's compose URL carries `bcc`
  and its window already shows the recipients.

Tests covering it: `tests/unit/share-request-email.test.ts` (the `draftUrl` shapes) and
`tests/unit/share-request-panel.test.tsx` (`describe("Send opens the connector itself")`).

---

## 4. Two things to verify, because I could not

⚠️ **I have not called Graph's draft endpoint.** Everything above is from the API contract, not from
a run. Two points to confirm on the first real consent, before calling this done:

1. **Does `webLink` open the draft in COMPOSE, with an editable Bcc line?** Microsoft documents
   `webLink` as opening the item in Outlook on the web. For a draft it should open in the composer,
   but if it opens in reading view the renter cannot press Send, and the ticket has not delivered
   what it promised. If that happens, the fallback is to build the deeplink from the message `id`
   rather than to give up on drafting.
2. **Is the Bcc line visible?** Outlook on the web hides Bcc until it has a value. A draft that
   carries `bccRecipients` should show it populated. Worth a screenshot on the first run, because
   "he can see who it goes to" is the entire point of the ticket.

---

## 5. Not changing

- **The SES path.** A verified domain still sends outright, and that stays right: there is no
  mailbox to put a draft in.
- **The recipient derivation.** Addresses still come from the renter's own supplier rows.
  🔴 Once a domain or a mailbox is connected this endpoint can put a real company's address in a
  `From` line, so a caller-supplied list would be an open relay signed with their DKIM.
- **The record.** `recordSends` still runs. ⚠️ Consider whether a DRAFT should be recorded as a
  send at all: he may never press Send. It is currently written at draft time, which makes the row a
  claim rather than evidence — the same distinction `declaredAt` versus `sentMessageId` already
  draws in `renter-supplier-sends.service.ts`. My reading is that a draft should record
  `declaredAt` only, with no `sentMessageId`, because nothing was observed leaving.

---

## 6. Deploy

Code only. No gateway change, no migration, no new IAM: the route and the SSM permissions already
exist from SUP-BE-23.

```
npm run deploy:partners:staging     # from apps/backend-agents
```

⚠️ Staging egresses through a **NAT instance** (`moedatech-staging-nat`, t4g.nano, single AZ). If it
stops, the Graph call fails and the feature reports *not configured*, degrading to the compose
window. Correct behaviour, but silent.

---

## 7. Current state of the surrounding work

- Azure app registration: **live**, multitenant, both redirect URIs registered, client id and secret
  in SSM at `/moedatech/staging/renter-mail/microsoft/*`. Verified 2026-09-05 against the real
  consent endpoint: HTTP 200, no `AADSTS` error.
- `GET /agents/mail-connect/status` answers `configured: true`.
- ⚠️ **No renter has completed a consent yet**, so no part of the Graph path has ever run against a
  real mailbox. This ticket and SUP-BE-23's Graph half are both unproven end to end.
- ⚠️ The owner's test account is `@gmail.com` and can never reach this path. Testing needs a renter
  on a Microsoft work address.
