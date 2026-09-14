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
- **The cap** counts the same statuses `createRequest` counts.

If the schema has moved under it, fix the script rather than working around it in the shell — the next run should not repeat the failure.

## Step 2 — the gates, in the order a renter meets them

Report each as pass or fail, and when it fails, name the **error the renter would actually see**.

**Can he use the app at all**
- `tenant_id` must be `default`. backend-agents pins `TENANT_ID` by omission, so a row stamped from SSM is invisible to it and every agents call 404s with «المستخدم غير موجود».

**Can he post a request** (`createRequest.ts`)
- `has_completed_onboarding` must be true, else **E10001 `GUEST_CANNOT_POST_REQUESTS`**. 🔴 **This is the gate — the tier is not.** A renter can read as basic or even verified and still be refused here.
- If `supplier_status <> 2`, at most **3** open requests (`OPEN`/`ACTIVE`/`PARTIALLY_ACCEPTED`), else `REQUEST_LIMIT_REACHED`.

**Is he a stuck account** — the trap worth checking on every single run
- Identity complete (first + last + city + jobTitle) **and** `has_completed_onboarding = 0`.
- Such a person is refused at post, and **no admin action rescues him**: `forceBasicTier` throws "already Basic" because he reads as basic, `forceVerifiedTier` writes the tier but not the flag, and `patchUser` writes neither. Only `completeProfile` (`PUT /users/me/profile`) or a direct write clears it.
- Say so explicitly when you find one. It is invisible from every screen.

**Can he share by email** (`shareEmail.ts`)
- `users.email` present → SES has a `From`. Absent → `NO_SENDER_ADDRESS` unless a mailbox is connected.
- At least one supplier row with a usable address, his own or the linked account's, else `NO_RECIPIENTS` — **`sent: false`, nothing leaves, and the panel quietly drops him to a compose window.** Zero rows is not the same as rows with no addresses: the first is a new account, the second is a broken send.

**The Outlook mailbox** — not in the database
The token is an SSM SecureString at `/moedatech/<stage>/renter-mail/tokens/<userId>/microsoft`. You cannot enumerate it; the classifier refuses. Hand Yara the command and say what each answer means:

```
!aws ssm describe-parameters --profile moedatech --parameter-filters "Key=Name,Option=BeginsWith,Values=/moedatech/prod/renter-mail/tokens/<USERID>" --query 'Parameters[].Name' --output json
```

Empty = not connected, which is **not** a fault: the send falls back to SES if `users.email` is set, else to a compose window.

## Step 3 — report

A verdict table, one row per gate, most severe first. Then, separately, the **one or two things to fix before the demo**, as actions rather than observations.

Rules for the report:

- **Distinguish blocking from cosmetic.** "No suppliers yet" is a starting state. "Two suppliers, neither with an address" is a broken send. Do not file the first as a risk.
- **Say what you did not check.** The SSM token, anything the classifier refused, anything the schema would not answer.
- **Never infer a cause from a correlation.** If an account is stuck, the audit log usually cannot tell you how — `patchUser` writes no audit row at all. Say the mechanism is unestablished rather than blaming a surface.
- **Quote the real error code** (`E10001`, `NO_RECIPIENTS`, `REQUEST_LIMIT_REACHED`). That is what turns a screenshot into a diagnosis.

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

1. `forceVerifiedTier` (`admin-user.service.ts:740`) writes `supplierStatus` and `isVerified` and **not** `hasCompletedOnboarding` — so an admin "verifying" a stuck renter leaves him refused at post. `forceBasicTier` gets this right 60 lines above, with a comment explaining exactly why.
2. `forceBasicTier` (`:673`) throws when the user already reads as basic, which is precisely the stuck population.
3. `patchUser.ts` writes all four identity fields, never the flag, and writes **no audit row**.
4. `updateProfile` (`PUT /profile/me`) writes the four identity fields without the flag.
