# Preview and confirm, before the e-mail goes

Supersedes the draft flow. The backend change is in the working tree, typecheck clean, **not yet
deployed**. Nothing here is blocked on further backend work.

---

## 1. What changed, and why

The Outlook path briefly created a **draft** in the renter's mailbox and handed you a `draftUrl` to
open. That is gone. It needed the `Mail.ReadWrite` scope, and real tenants refuse it.

Measured in Moedatech's own tenant on 2026-09-05:

- a consent under `Mail.Send` completed at 20:31, no administrator involved, and a send worked;
- the `Mail.ReadWrite` build deployed at 22:14;
- the next consent attempt returned Microsoft's **"Need admin approval"** page.

The same tenant grants one and refuses the other. An admin asked to approve *"send mail as the
signed-in user"* often will; almost none will approve *"read and write all their mail"*.

So the requirement stands and the mechanism moves: the renter still sees every recipient and confirms
before anything leaves, but he does it in **our panel** rather than in Outlook's composer. That was
always the real requirement. Opening Outlook was only one way of meeting it.

---

## 2. The change on your side, in one line

Call the same endpoint twice: once with `dryRun: true` to draw a confirm panel, once without it when
he presses Confirm.

```
1. POST /agents/requests/{id}/share-email   { …, "dryRun": true }   -> render the panel
2. POST /agents/requests/{id}/share-email   { … }                   -> sends
```

Same body both times, minus the flag. If the supplier selection changes in between, preview again
rather than sending the old envelope.

---

## 3. The preview reply

```jsonc
{ "success": true, "data": {
  "sent": false,
  "reason": "PREVIEW",
  "from": "bandar@zahid.sa",
  "via": "graph",                                   // or "ses"
  "to": ["bandar@zahid.sa"],
  "bcc": ["ops@alfaisal.sa", "rfq@najd.sa"],
  "subject": "RFQ for Crawler Excavator 20 ton",
  "recipients": 2,
  "skippedIds": ["4e7d556a-…"]
} }
```

⚠️ **`sent: false` with `reason: "PREVIEW"` is a success, not a failure.** It is the only `sent:
false` that is not a fallback signal. Every other one still means "open the compose window"; this one
means "draw the panel".

⚠️ **Nothing is recorded on a preview.** A share the renter abandons leaves no trace, so you can call
it as often as you like, including on every change to the selection.

### What to draw, and where each part comes from

| On screen | Source |
|---|---|
| "From bandar@zahid.sa" | `from` |
| "Blind copy to 2 suppliers", listed | `bcc` |
| the subject line | `subject` |
| **the card itself** | **your own `html`**, the one you are about to post. No round trip for this |
| "Najd Equipment has no e-mail on file and will be skipped" | `skippedIds`, mapped to names you already hold |
| "A copy will be saved to your Sent folder" | `via === "graph"` |

🔴 **`bcc` and `skippedIds` must come from us, and this is the reason the preview is a server call at
all.** The recipient list is derived on the backend from the renter's own supplier rows, including
the fallback to a linked account's address when a row carries no e-mail of its own. The panel cannot
work out which suppliers actually get written to, nor which get dropped for having none. A preview
built from what the client happens to know would not merely drift from the send, it could not be
correct in the first place.

The same code path produces the preview and the send, so what he confirms is what goes out.

⚠️ `skippedIds` names the rows rather than counting them, so say **which** supplier is being left out.
A number he cannot act on is not a preview.

---

## 4. The send reply

Unchanged except that `draftUrl` is gone and `inSentFolder` means something again.

```jsonc
{ "success": true, "data": {
  "sent": true,
  "from": "bandar@zahid.sa",
  "via": "graph",
  "messageId": null,          // a string on the "ses" path only
  "inSentFolder": true,       // true on "graph", false on "ses"
  "recipients": 2,
  "recorded": 2,
  "skipped": 1
} }
```

⚠️ **Stop opening a tab on `sent: true`.** There is no `draftUrl` any more. Show a confirmation
instead.

⚠️ `messageId` is null on the Outlook path and that is correct, not a bug. Graph answers `202` with an
empty body. Use `via` to tell the engines apart, never `messageId`.

---

## 5. What has not changed

- **The connect flow**, including the pop-up fix. Still: open the blank window as the first statement
  of the click, then aim it once the URL comes back.
- **The reason table** and the Connect / Reconnect buttons. `connectPath` being null is still the test
  for whether to draw a button, not the reason string.
- **The compose-window fallback** for every `sent: false` that is not `PREVIEW`.
- **Not calling `POST /shares`** after a successful send. That route records what the renter *says* he
  sent from his own client; this one records the send itself.
- The card HTML, the message template, the recipient picker.

---

## 6. One thing that will look like a bug and is not

🔴 **Everyone connected before this ships must reconnect, once.** A refresh token carries the scopes it
was granted with, so a token minted under `Mail.ReadWrite` cannot be used for `Mail.Send`. Graph
answers 403, the backend drops the token and returns `RECONNECT_REQUIRED`, and your Reconnect button
draws on that reason.

Right now the count is zero, since the only connection made so far was already destroyed by the
previous scope change. If it ships before anyone reconnects, nobody is affected.

---

## 7. Still true, and still worth saying on screen

Some Microsoft 365 tenants block third-party consent outright. Those renters see Microsoft's "Need
admin approval" page, we get `access_denied`, and the callback redirects with `mailConnect=denied`.
Word that as *"consent was not granted, your organisation may need an administrator to approve it"*
rather than as a failure on their part. It is a routine outcome, not an edge case, and no code change
on either side removes it.
