---
description: Health assessment of one renter's account against the live database. Give it a phone number; it reports whether that person can post a request, share by email, and use the app at all, naming the exact gate that would refuse him. Reads only, never writes.
---

# /web:account — one renter, assessed against the live database

Yara gives you a **phone number**. You answer one question: *if this person opens the app right now, what works and what refuses him, and why.*

This exists because the tier a renter sees and the gate the backend applies are **two different facts**, and they drift. A badge reading "basic" is not permission to post. The assessment must ask the question each gate asks, not the question the UI asks.

**Read only.** Never create a request, never write a row, never "fix" the account. If something is broken, name it and stop. A demo account is not a place to experiment.

## Arguments

`$ARGUMENTS` = the phone number, optionally followed by the stage.

| Example | Means |
|---|---|
| `/web:account +966502003517` | assess against **prod** (default) |
| `/web:account 0502003517 staging` | assess against staging |

Any format is fine. The script matches on the **last 9 digits**, because `users.contact_number` is stored inconsistently (`+966…`, `966…`, `05…`).

## Step 0 — preflight, every run, no exceptions

The prod database is a publicly-reachable RDS instance guarded by a security group. **Your IP rotates**, so a run that worked this morning fails this afternoon with `Can't reach database server`. Check before you connect, not after:

```bash
curl -s https://checkip.amazonaws.com
aws ec2 describe-security-groups --profile moedatech --group-ids sg-005c8d3201233807d \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`3306`].IpRanges[].CidrIp' --output json
```

If your `/32` is not in that list, **you cannot add it yourself** — the permission classifier refuses security-group changes. Print this for Yara to run, with the real IP substituted, and wait:

```
!aws ec2 authorize-security-group-ingress --profile moedatech --group-id sg-005c8d3201233807d --ip-permissions 'IpProtocol=tcp,FromPort=3306,ToPort=3306,IpRanges=[{CidrIp=<IP>/32,Description="Yara laptop temp - account health check, remove after"}]'
```

Note the rule id it returns. **You owe him the revoke command at the end of the report.**

Facts you need and should not re-derive:

| Thing | Value |
|---|---|
| AWS profile | `moedatech` — the default profile has no credentials |
| Region | `eu-central-1` |
| Prod db | `moedatech-prod-db.chem2ks0wvek.eu-central-1.rds.amazonaws.com:3306`, MySQL |
| Prod security group | `sg-005c8d3201233807d` |
| Staging security group | `sg-038374818766dbfbd` |
| Connection string | read by the script from `../Moedatech-App/apps/backend/.env.prod` — **never print it, never cat that file** |

## Step 1 — run it

```bash
node scripts/account-health.cjs <phone> [prod|staging]
```

One connection, one pass, every check. It mirrors the backend's own logic rather than guessing at it:

- **Tier** is computed exactly as `getUserTier` does (`apps/backend/src/services/profile.service.ts`), inherited company verification included.
- **Emailability** mirrors `addressesFor` (`shareEmail.ts`), the linked-account fallback included.
- **The open-request count** compares the denormalised column against the live rows. It is a DRIFT check now, not a cap check — no cap exists on either side since 2026-09-14.

If the schema has moved under it, fix the script rather than working around it in the shell — the next run should not repeat the failure.

## Step 2 — the gates, in the order a renter meets them

Report each as pass or fail, and when it fails, name the **error the renter would actually see**.

**Can he use the app at all**
- `tenant_id` must be `default`. backend-agents pins `TENANT_ID` by omission, so a row stamped from SSM is invisible to it and every agents call 404s with «المستخدم غير موجود».

**Can he post a request** — and the answer changed on 2026-09-13/14

🔴 **Both of the web's entry gates were DELETED, a day apart.** Read the standing comment at
`backend-agents/createRequest.ts:387-411` before trusting anything else in this section; it records
both removals and the owner's words for each.

| Surface | Code | Refuses when |
|---|---|---|
| **web** (`backend-agents/createRequest.ts`) | owner lookup selects `{ id: true }` and nothing else | the user row does not exist for this `tenantId`. **That is the whole gate.** |
| **app** (`apps/backend/request.service.ts:121` `requireBasicTier`) | `!hasCompletedOnboarding && getUserTierFor(user) === 'guest'` | a **real** guest — flag false AND tier guest |

So:
- ~~`has_completed_onboarding` must be true, else E10001~~ — **gone from the web** (removed 2026-09-13,
  *"make user if not complete the onboarding can send request"*; prod had five 403s in five minutes from it).
  On the app it survives only as **half of an AND**, widened the same day: the flag alone asks the wrong
  question, since only `completeProfile` has ever written that column. Of 1,542 live accounts carrying
  `false`, **9 are not guests at all and all 9 are ops-verified** (measured 2026-09-13).
- ~~the 3-request cap~~ — **gone** (removed 2026-09-14). `REQUEST_LIMIT_REACHED` is now thrown by nothing.
- `E10001 GUEST_CANNOT_POST_REQUESTS` still exists in `error-codes.ts` for other callers. **The web raises it nowhere.**

⚠️ **The divergence REVERSED.** The web used to be the strict side; it is now the permissive one.
A true guest — no name, no city, no job title, no verification, flag false — is **refused on his phone
and served in the browser**. Report it that way round.

🔴 **The "stuck account" trap is RETIRED, and do not report it.** Identity complete +
`has_completed_onboarding = 0` used to be unrescuable by any admin action. It now blocks nothing:
the web never reads the flag, and the app's guest test fails for such a person because his tier is
basic or better. The admin-side faults listed at the foot of this file are still real, but they no
longer strand anybody at post.

⚠️ **What you cannot tell from source: which build prod runs.** The removals landed on
`origin/main` on 2026-09-14. If an account WOULD have been refused under the old rules, say plainly
that the answer depends on the deployed build and that you did not verify it.

**Can he share by email** (`shareEmail.ts`)
- 🔴 **An empty `users.email` is NOT a blocker, and reporting it as one is wrong.** The renter sends
  by connecting his own Outlook, and Graph sends from the mailbox he consented with — `sendViaGraph`
  sets no `from` and never reads `users.email`. The guard was narrowed twice for exactly this:
  `NO_SENDER_ADDRESS` now survives for **one** case, `access.reason === 'NOT_CONFIGURED'`, where the
  stage has no Microsoft app registration, nobody can connect, SES is the only path and there is no
  `From` to claim (`shareEmail.ts:205-233`). Every other failure reports the reason `accessTokenFor`
  already computed — `NOT_CONNECTED` or `RECONNECT_REQUIRED` — with `connectPath` beside it.
- So: profile e-mail absent + mailbox connectable = **fine**. Note it as context, never as a risk.
  It only matters on the SES fallback, which is for a firm whose IT did the DNS work.
- At least one supplier row with a usable address, his own or the linked account's, else `NO_RECIPIENTS` — **`sent: false`, nothing leaves, and the panel quietly drops him to a compose window.** Zero rows is not the same as rows with no addresses: the first is a new account, the second is a broken send.

**The Outlook mailbox** — not in the database
The token is an SSM SecureString at `/moedatech/<stage>/renter-mail/tokens/<userId>/microsoft`. You cannot enumerate it; the classifier refuses. Hand Yara the command and say what each answer means:

```
!aws ssm describe-parameters --profile moedatech --parameter-filters "Key=Name,Option=BeginsWith,Values=/moedatech/prod/renter-mail/tokens/<USERID>" --query 'Parameters[].Name' --output json
```

Empty = not connected, which is **not** a fault: the send falls back to SES if `users.email` is set, else to a compose window.

## Step 2b — the app and the web share one database, and they do not agree

🔴 **This is the half that makes the assessment worth running at all.** One MySQL instance is served by **three** Lambda services, and the same renter moves between them without knowing:

| Service | Who uses it | Which code |
|---|---|---|
| `apps/backend` | the **mobile app** | `request.service.ts`, `profile.service.ts` |
| `apps/backend-agents` | the **web** | `createRequest.ts`, `shareEmail.ts` |
| `apps/backend-admin` | the **admin panel** | `patchUser.ts`, `admin-user.service.ts` |

So a person can be created in one, edited in a second and refused by a third, and each is reading the same rows through different rules. Never report "his account is fine" — report **which surface** it is fine on.

### Known disagreements — check every one, and name the surface

**1. ~~The request cap is WEB-ONLY.~~ RETIRED 2026-09-14 — there is no cap anywhere.** Both sides now
post unlimited simultaneous requests. `apps/backend/request.service.ts:156` dropped it first
(*"Request-count cap removed: all onboarded rentees (verified or not) can post unlimited simultaneous
requests"*); `backend-agents/createRequest.ts:220` followed, and its `BASIC_TIER_REQUEST_LIMIT` is struck
through in place. `REQUEST_LIMIT_REACHED` is now raised by nothing. **Never report a cap.**

**2. The guest gate now cuts the OTHER way, and this is the live divergence.**
- **app**: `!hasCompletedOnboarding && tier === 'guest'` → `GUEST_CANNOT_POST_REQUESTS`. An **OR, never a
  swap** (the file says so): widened so nobody who could post lost it, and a genuine phone-only account
  with no name and no verification is still refused.
- **web**: no such test at all. The row only has to exist.

> A true guest is **refused on his phone and served in the browser.** That is the sentence to write, and
> it is the reverse of what this file said before 2026-09-14.

**2b. Verification is inherited for the tier.** `getUserTier` treats a member of a verified company as
Verified, and `getUserTierFor` does the same inside the app's guest test — so company membership can lift
an account out of `guest` and past that gate even with the flag false. Nothing reads `supplierStatus` for
a posting limit any more, because there is no limit.

**3. `open_request_count` is a denormalised column, and the two sides read different things.** The **app's home screen** reads the column (`home_bloc.dart:129` ← `profile.openRequestCount`); **backend-agents counts rows**. Both services increment and decrement it, and `commitment-cascade.service.ts:134` carries a warning about it drifting upward. A drift means the phone shows a number the browser disagrees with, and neither is obviously wrong from the screen. The script compares them; report a mismatch as a data fault, not a UI one.

**4. `hasCompletedOnboarding` has five writers and one of them is the app's own.** `completeProfile`, both `createUser`s, `forceBasicTier`, `partner/updateProfile`. Two writers of the identity fields set it and two do not — which is *why* both gates stopped reading it alone. Worth knowing when reading the column; **not** worth reporting as a risk on its own any more.

**5. Requests carry `request_origin`** (`ORGANIC` / `TRIAL` / `OUTREACH`) and `is_trial`. A renter whose history is mostly `TRIAL` has not really used the product, and a trial row expires in 60 minutes — do not read one as evidence that posting works.

### The rule for the report
When a check fails, say **where** it fails: "capped on web, allowed in the app", "stuck for the web's gate, fine for the app's". A single-verdict answer is wrong on a shared database.

## Step 3 — report

A verdict table, one row per gate, most severe first. Then, separately, the **one or two things to fix before the demo**, as actions rather than observations.

Rules for the report:

- **Distinguish blocking from cosmetic.** "No suppliers yet" is a starting state. "Two suppliers, neither with an address" is a broken send. Do not file the first as a risk.
- **Say what you did not check.** The SSM token, anything the classifier refused, anything the schema would not answer.
- **Never infer a cause from a correlation.** If an account is stuck, the audit log usually cannot tell you how — `patchUser` writes no audit row at all. Say the mechanism is unestablished rather than blaming a surface.
- **Quote the real error code** (`E10001`, `NO_RECIPIENTS`, `NOT_CONNECTED`, `RECONNECT_REQUIRED`). That is what turns a screenshot into a diagnosis. `REQUEST_LIMIT_REACHED` is dead — quoting it dates the report.

## Step 4 — clean up, in the report

Every run ends with the revoke command and the rule id:

```
!aws ec2 revoke-security-group-ingress --profile moedatech --group-id sg-005c8d3201233807d --security-group-rule-ids <RULE_ID>
```

Leaving a laptop IP on a production security group is the cost of this skill, and it must be paid back the same day.

## What the classifier will refuse, so you do not waste a turn

Learned the hard way; work with these rather than around them.

| Refused | Do instead |
|---|---|
| `cat`/`grep` on `.env.prod`, `~/.aws/credentials` | let the script read it; it never prints the value |
| security-group changes | print the command for Yara |
| enumerating SSM tokens | print the command for Yara |
| whole-table reads (`GROUP BY` over all users, censuses) | single-account reads pass; hand him the census SQL |

Single-account lookups are consistently allowed. That is the whole design of this skill: **one account, named in advance.**

## Known backend faults this check keeps meeting

Report them when the account shows them; do not re-investigate from scratch each time.

⚠️ **All four are admin-side and none of them blocks posting any more** (the gate that made them
bite was removed 2026-09-13). They still leave the column untrue, which matters to anything that reads it.



1. `forceVerifiedTier` (`admin-user.service.ts:740`) writes `supplierStatus` and `isVerified` and **not** `hasCompletedOnboarding` — so an admin "verifying" a stuck renter leaves him refused at post. `forceBasicTier` gets this right 60 lines above, with a comment explaining exactly why.
2. `forceBasicTier` (`:673`) throws when the user already reads as basic, which is precisely the stuck population.
3. `patchUser.ts` writes all four identity fields, never the flag, and writes **no audit row**.
4. `updateProfile` (`PUT /profile/me`) writes the four identity fields without the flag.
