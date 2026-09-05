# Keeping the share template on his account, not in his browser

**Status: NOT BUILT, deliberately.** Owner, 2026-09-05: *"keep it as a note but for now keep it
browser."*

Everything below was written, typechecked and tested on 2026-09-05, then taken back out so the
backend repo stays clean. It is here so restoring it is copy-and-paste rather than a redesign.

---

## What ships today

The share template is **per browser**, in `localStorage`, under `moeda.shareTemplate.<lang>`, holding
one wording per channel:

```jsonc
{ "email":    { "title": "…", "above": "…", "below": "…" },
  "whatsapp": { … },
  "other":    { … } }
```

It survives closing the tab and months of not using it. It does **not** survive a second laptop, a
phone, a different browser, or cleared site data.

⚠️ **The cost, stated plainly:** a renter who writes his wording on the office desktop and then
shares from his phone on site meets our default. Whether that matters depends on whether your
renters share from one machine.

---

## Why a table, and why every alternative is worse

The question was whether six short strings per renter justify a migration. They do, because the
migration is one additive `CREATE TABLE` with no backfill, and each way of avoiding it is worse:

| Option | Migration | The catch |
|---|---|---|
| **New table** | one, additive | none found |
| JSON column on `users` | yes, same size | `users` is read on nearly every request in three backends; this blob is read by one screen and would ride along in every `SELECT *` |
| `audit_logs` | none | It is an append-only EVENT log. A greeting is mutable state, so "his wording" becomes "read the newest row", it grows a row per edit forever, and settings get written into the one table whose job is being a true record of events |
| SSM Parameter Store | none | The precedent exists (mail tokens). But it is a config store: a hard 10,000-parameter ceiling, so it breaks at 10,000 renters, and it costs a network call per panel open |
| S3, one object per renter | none | Works and is cheap. An odd home, and it adds S3 IAM to the partners role for six strings |

---

## Placement

`GET` and `PATCH` at **`/agents/renter-suppliers/share-templates`**, in the **partners** domain.

Two reasons, both from the repo's own rule in `Moedatech-App/CLAUDE.md` step 3: a renter working in a
business area an existing domain owns goes in that domain, and **`/agents/renter-suppliers/{proxy+}`
is already a gateway route**, so this needs a code deploy and no gateway change.

⚠️ Both routes must be registered **above** `/agents/renter-suppliers/{id}`, or a GET for
`share-templates` is read as a supplier whose id is the literal string `share-templates`, and
answers 404.

---

## The three rules that decide whether this helps or loses his words

1. **GET answers `null`, never `{}`.** The web reads null as *the account has nothing to say* and
   keeps its browser copy. An empty object would overwrite wording he had already typed on that
   machine the first time he opened the panel on it, which is the exact loss this exists to prevent.
2. **A write REPLACES the language it names.** A deep merge would make *"he deleted his sign-off"*
   indistinguishable from *"that field was not sent"*, and his delete would come back on the next
   read.
3. **A write LEAVES ALONE the language it does not name.** Editing in English must not wipe his
   Arabic wording by omission.

⚠️ Scoped to the **USER**, not the firm, and deliberately unlike `renter_suppliers` beside it. A
supplier list is the company's asset and two colleagues must see the same one. A greeting is a
person's voice; sharing it would mean one colleague's edit silently rewrote the other's outgoing
mail.

⚠️ The account write must be **debounced**. The first cut fired a PUT per character: forty requests
to type a greeting, arriving out of order, last one to land deciding what the account holds. The
browser write stays undebounced, because it costs nothing and a tab closed mid-sentence should keep
the sentence.

---

## Restoring it

### 1 · `apps/backend/prisma/migrations/20260905120000_renter_share_templates/migration.sql`

```sql
-- The renter's share wording, kept on his account — SUP-BE-25.
-- docs/implementation-plans/renter-suppliers/backend-share-tickets.md (Web-App repo)
--
-- Owner, 2026-09-05: *"different template per channel but i want it stored in his profile."*
--
-- The web has stored this in `localStorage` since the feature shipped. That survives closing the
-- tab and months of not using it, and it does not survive a second laptop, a phone, a different
-- browser, or cleared site data — so a renter who wrote his wording once, on the machine he
-- happened to be at, met our default everywhere else.
--
--
-- ── Why a table and not a column on `users` ─────────────────────────────────────────────────────
--
-- `users` is read on nearly every request in three backends. This blob is read by exactly one
-- screen. A JSON column there would ride along in every user SELECT that does not name its columns,
-- for the benefit of the one caller that wants it.
--
-- One row per renter, created on first write. NO BACKFILL: a renter with no row has never edited
-- his wording, which is exactly what "no row" should mean.
--
--
-- ── Why one JSON blob and not six columns ───────────────────────────────────────────────────────
--
-- ⚠️ It is the renter's own phrasing, not a setting with rules. Nothing here is validated beyond
-- being strings, and nothing queries INSIDE it — it is read whole and written whole by one owner.
-- Six columns would buy a schema migration every time the web adds a channel or a field, for a
-- shape only the web understands.
--
-- The blob is `{ en: { email: {title,above,below}, whatsapp: {…}, other: {…} }, ar: {…} }`.
--
--
-- ── Scope: the USER, not the firm ───────────────────────────────────────────────────────────────
--
-- ⚠️ Deliberately different from `renter_suppliers`, which is firm-scoped. A supplier list is the
-- company's asset and two colleagues must see the same one. A greeting is a person's voice, and
-- sharing it would mean one colleague's edit silently rewrote the other's outgoing mail.

CREATE TABLE `renter_share_templates` (
  `id`         VARCHAR(191) NOT NULL,
  `tenant_id`  VARCHAR(191) NOT NULL DEFAULT 'default',
  `user_id`    INTEGER      NOT NULL,
  `templates`  JSON         NOT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  -- One row per renter per tenant. The upsert below depends on this being unique.
  UNIQUE KEY `renter_share_templates_tenant_user` (`tenant_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2 · `apps/backend/prisma/schema.prisma`

```diff
diff --git a/apps/backend/prisma/schema.prisma b/apps/backend/prisma/schema.prisma
index 963fed51..248aede1 100644
--- a/apps/backend/prisma/schema.prisma
+++ b/apps/backend/prisma/schema.prisma
@@ -2025,6 +2025,28 @@ model WorkOrderItem {
 ///
 /// Two invariants live as CHECK constraints in the migration and nowhere in this file:
 /// `kind`/`supplierUserId` move together, and an `own` row must be named.
+/// The renter's own share wording, kept on his account (SUP-BE-25).
+///
+/// ⚠️ **Scoped to the USER, not the firm** — deliberately unlike `RenterSupplier` beside it. A
+/// supplier list is the company's asset and two colleagues must see the same one. A greeting is a
+/// person's voice, and sharing it would mean one colleague's edit silently rewrote the other's
+/// outgoing mail.
+///
+/// ⚠️ `templates` is read whole and written whole by one screen, and nothing queries inside it.
+/// It holds `{ en: { email: {title,above,below}, whatsapp: {}, other: {} }, ar: {} }`. Six columns
+/// would buy a migration every time the web adds a channel, for a shape only the web understands.
+model RenterShareTemplate {
+  id        String   @id @default(uuid())
+  tenantId  String   @default("default") @map("tenant_id")
+  userId    Int      @map("user_id")
+  templates Json
+  createdAt DateTime @default(now()) @map("created_at")
+  updatedAt DateTime @updatedAt @map("updated_at")
+
+  @@unique([tenantId, userId], map: "renter_share_templates_tenant_user")
+  @@map("renter_share_templates")
+}
+
 model RenterSupplier {
   id                 String    @id @default(uuid())
   tenantId           String    @map("tenant_id")
```

### 3 · `apps/backend-agents/src/services/renter-share-template.service.ts`

```ts
/**
 * The renter's share wording, one row per person — SUP-BE-25.
 *
 * ⚠️ **Scoped to the USER, not the firm**, and deliberately unlike `renter-supplier.service.ts`
 * beside it. A supplier list is the company's asset and two colleagues must see the same one. A
 * greeting is a person's voice: sharing it would mean one colleague's edit silently rewrote the
 * other's outgoing mail, and neither would know why their message had changed.
 *
 * ⚠️ **Read whole, written whole.** Nothing queries inside the blob, so it is a single JSON column
 * rather than six. See the migration for why that is a decision and not a shortcut.
 */

import { prisma } from '../lib/prisma';

/**
 * A ceiling, not a rule about wording.
 *
 * Six short strings per language is a few hundred bytes; 64 KB is far past any greeting and still
 * bounds a caller that has gone wrong. The handler checks it before the write so the answer is a
 * 400 the web can read, rather than a database error nobody can.
 */
export const MAX_TEMPLATES_BYTES = 64 * 1024;

export type ShareTemplate = { title?: string; above?: string; below?: string };
export type ShareTemplateSet = { email?: ShareTemplate; whatsapp?: ShareTemplate; other?: ShareTemplate };
export type ShareTemplateStore = { en?: ShareTemplateSet; ar?: ShareTemplateSet };

const tenant = () => process.env.TENANT_ID || 'default';

/**
 * What he has stored, or `null` when he has never edited anything.
 *
 * ⚠️ **Null rather than an empty object**, because the two mean different things to the caller: the
 * web keeps its own copy on null and would overwrite it with ours on `{}`.
 */
export async function readShareTemplates(userId: number): Promise<ShareTemplateStore | null> {
  const row = await prisma.renterShareTemplate.findUnique({
    where: { tenantId_userId: { tenantId: tenant(), userId } },
    select: { templates: true },
  });
  const value = row?.templates;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as ShareTemplateStore;
}

/**
 * Store it, and answer what is now stored.
 *
 * ⚠️ **The languages named are REPLACED, the one not named is left alone.** A renter editing in
 * English sends both today, but a caller that sends only `ar` must not silently wipe his English
 * wording — and equally, inside a language, a replace is what makes a DELETED line stick. A deep
 * merge would make "he removed his sign-off" indistinguishable from "that field was not sent".
 */
export async function writeShareTemplates(userId: number, next: ShareTemplateStore): Promise<ShareTemplateStore> {
  const current = (await readShareTemplates(userId)) ?? {};
  const merged: ShareTemplateStore = { ...current, ...next };

  await prisma.renterShareTemplate.upsert({
    where: { tenantId_userId: { tenantId: tenant(), userId } },
    create: { tenantId: tenant(), userId, templates: merged },
    update: { templates: merged },
  });
  return merged;
}
```

### 4 · `apps/backend-agents/src/handlers/agents/renter-suppliers/shareTemplates.ts`

```ts
/**
 * The renter's share wording, kept on his account — SUP-BE-25.
 *
 *   GET   /agents/renter-suppliers/share-templates  -> the blob, or null
 *   PATCH /agents/renter-suppliers/share-templates  -> the blob it stored
 *
 * Owner, 2026-09-05: *"different template per channel but i want it stored in his profile."*
 *
 * The web has kept this in `localStorage` since the feature shipped. That survives closing the tab
 * and months of not using it, and it does not survive a second laptop, a phone, a different
 * browser, or cleared site data — so a renter who wrote his wording once met our default on every
 * other machine he ever opened.
 *
 * ── Under `renter-suppliers`, and that is the placement rule, not laziness ──────────────────────
 *
 * `CLAUDE.md` step 3: same actor, same business area, existing domain wins. This is a renter doing
 * work in the "share a request with my suppliers" area, which the partners domain already owns —
 * and `/agents/renter-suppliers/{proxy+}` is already a gateway route, so this needs a code deploy
 * and no gateway change.
 *
 * ⚠️ **Nothing here validates his phrasing beyond "is a string".** A greeting is not the backend's
 * business to have opinions about, and a rejected write loses wording he had already typed. The
 * only limits are the ones that protect the database: a fixed set of keys, and a size cap.
 *
 * Auth: agentServiceAuthorizer (service token), so the renter is named as `userId` — the same
 * arrangement as `shares.ts` beside it.
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { success, errors } from '../../../utils/response.util';
import { logger } from '../../../lib/logger';
import { readShareTemplates, writeShareTemplates, MAX_TEMPLATES_BYTES } from '../../../services/renter-share-template.service';

/**
 * One channel's wording.
 *
 * ⚠️ Every field OPTIONAL, and that is the contract. The web sends what it has; a version that
 * learns a fourth field must not need this deployed first, and a version that drops one must not
 * 400. Unknown keys are stripped by zod rather than refused, for the same reason.
 */
const template = z.object({
  title: z.string().max(2000).optional(),
  above: z.string().max(8000).optional(),
  below: z.string().max(8000).optional(),
});

/**
 * ⚠️ The channel names are FIXED, unlike the fields inside them. A free-form key would let a caller
 * grow the blob without bound, and the cap below is a second line of defence rather than the first.
 */
const set = z.object({
  email: template.optional(),
  whatsapp: template.optional(),
  other: template.optional(),
});

const body = z.object({
  userId: z.number().int().positive(),
  en: set.optional(),
  ar: set.optional(),
});

const userIdOf = (event: { queryStringParameters?: Record<string, string | undefined> | null }) => {
  const raw = event.queryStringParameters?.userId;
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** What he has stored, or `null` when he has never edited anything. */
export const get: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = userIdOf(event);
    if (!userId) return errors.badRequest('A user id is required', 'معرّف المستخدم مطلوب');

    /**
     * ⚠️ **Null, not a default.** The web treats null as "the account has nothing to say" and keeps
     * whatever the browser already holds. Answering a default here would overwrite wording a renter
     * had typed on this machine the first time he opened the panel on it — the exact loss this
     * endpoint exists to prevent.
     */
    return success(await readShareTemplates(userId));
  } catch (err) {
    logger.logError(err as Error, { handler: 'agents/renter-suppliers/share-templates:get' });
    return errors.internalError('Failed to read the share templates', 'فشل قراءة قوالب المشاركة');
  }
};

/**
 * Store it.
 *
 * ⚠️ **A full replace of the languages it names, not a deep merge.** The web sends both languages
 * every time, and it is the only writer. A merge would make "he deleted a line" indistinguishable
 * from "he did not send that field", and the renter's delete would never stick.
 */
export const patch: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    let raw: unknown;
    try { raw = JSON.parse(event.body ?? '{}'); } catch { return errors.badRequest('Invalid JSON body', 'محتوى غير صالح'); }

    const parsed = body.safeParse(raw);
    if (!parsed.success) return errors.validationError(parsed.error.flatten());
    const { userId, ...languages } = parsed.data;

    if (Buffer.byteLength(JSON.stringify(languages), 'utf8') > MAX_TEMPLATES_BYTES) {
      return errors.badRequest('The templates are too large to store', 'القوالب أكبر من الحد المسموح');
    }
    // Nothing to write is not an error: a caller that sends only `userId` has said nothing.
    if (!languages.en && !languages.ar) return success(await readShareTemplates(userId));

    return success(await writeShareTemplates(userId, languages));
  } catch (err) {
    logger.logError(err as Error, { handler: 'agents/renter-suppliers/share-templates:patch' });
    return errors.internalError('Failed to save the share templates', 'فشل حفظ قوالب المشاركة');
  }
};
```

### 5 · `apps/backend-agents/src/apps/agents-partners.ts`

```diff
diff --git a/apps/backend-agents/src/apps/agents-partners.ts b/apps/backend-agents/src/apps/agents-partners.ts
index 1e8c3059..8e1d1175 100644
--- a/apps/backend-agents/src/apps/agents-partners.ts
+++ b/apps/backend-agents/src/apps/agents-partners.ts
@@ -29,6 +29,7 @@ import { handler as agentsJoinCompany } from '../handlers/agents/companies/join'
 import { handler as agentsLeaveCompany } from '../handlers/agents/companies/leave';
 import { handler as agentsLinkRenterSuppliers } from '../handlers/agents/renter-suppliers/linkRenterSuppliers';
 import { list as agentsListRenterSupplierGroups } from '../handlers/agents/renter-suppliers/groups';
+import { get as agentsGetShareTemplates, patch as agentsPatchShareTemplates } from '../handlers/agents/renter-suppliers/shareTemplates';
 import { handler as agentsListRenterSupplierSuggestions } from '../handlers/agents/renter-suppliers/listSuggestions';
 import { handler as agentsListRenterSuppliers } from '../handlers/agents/renter-suppliers/listRenterSuppliers';
 import { handler as agentsListSupplierEquipment } from '../handlers/agents/suppliers/listEquipment';
@@ -60,6 +61,15 @@ const ROUTES: RouteSpec[] = [
   { method: 'POST', path: '/agents/companies/validate-code', handler: agentsValidateCompanyCode as unknown as RouteSpec['handler'] },
   { method: 'POST', path: '/agents/renter-suppliers/bulk', handler: agentsBulkRenterSuppliers as unknown as RouteSpec['handler'] },
   { method: 'GET', path: '/agents/renter-suppliers/groups', handler: agentsListRenterSupplierGroups as unknown as RouteSpec['handler'] },
+  /**
+   * SUP-BE-25. Under the existing `/agents/renter-suppliers/{proxy+}` gateway route, so this needs
+   * a code deploy and NO gateway change.
+   *
+   * ⚠️ Both must sit ABOVE `/agents/renter-suppliers/{id}`, or a GET for `share-templates` is
+   * read as a supplier whose id is the literal string `share-templates` and answers 404.
+   */
+  { method: 'GET', path: '/agents/renter-suppliers/share-templates', handler: agentsGetShareTemplates as unknown as RouteSpec['handler'] },
+  { method: 'PATCH', path: '/agents/renter-suppliers/share-templates', handler: agentsPatchShareTemplates as unknown as RouteSpec['handler'] },
   { method: 'PATCH', path: '/agents/renter-suppliers/groups', handler: agentsRenameRenterSupplierGroup as unknown as RouteSpec['handler'] },
   { method: 'POST', path: '/agents/renter-suppliers/invites', handler: agentsCreateRenterSupplierInvite as unknown as RouteSpec['handler'] },
   { method: 'POST', path: '/agents/renter-suppliers/link', handler: agentsLinkRenterSuppliers as unknown as RouteSpec['handler'] },
```

### 6 · `apps/backend-agents/src/tests/unit/share-templates.test.ts`

11 tests, all passing on 2026-09-05.

```ts
/**
 * SUP-BE-25 — the renter's share wording, kept on his account.
 *
 * Owner, 2026-09-05: *"different template per channel but i want it stored in his profile."*
 *
 * Three things decide whether this endpoint helps or hurts, and all three are about NOT losing
 * words a renter typed:
 *
 *   1. an account with nothing must answer `null`, never a default — the web keeps its browser copy
 *      on null and would overwrite it with ours on `{}`;
 *   2. a write must REPLACE the language it names, or a deleted line never sticks;
 *   3. a write must LEAVE ALONE the language it does not name.
 */

const findUnique = jest.fn();
const upsert = jest.fn();
jest.mock('../../lib/prisma', () => ({
  prisma: { renterShareTemplate: { findUnique: (...a: unknown[]) => findUnique(...a), upsert: (...a: unknown[]) => upsert(...a) } },
}));

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { get, patch } from '../../handlers/agents/renter-suppliers/shareTemplates';

const readBody = (res: { body?: string }) => JSON.parse(res.body ?? '{}');
const getEvent = (query: Record<string, string> = {}) => ({ queryStringParameters: query } as unknown as APIGatewayProxyEventV2);
const patchEvent = (body: unknown) => ({ body: JSON.stringify(body) } as unknown as APIGatewayProxyEventV2);

const EN = { email: { title: 'RFQ for {equipment}', above: 'Hello,', below: 'Thanks' } };
const AR = { email: { title: 'طلب عرض', above: 'مرحباً،', below: 'شكراً' } };

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
  findUnique.mockResolvedValue(null);
  upsert.mockResolvedValue({});
});

describe('GET share-templates', () => {
  it('answers NULL when he has never edited anything', async () => {
    /**
     * 🔴 Not `{}`. The web reads null as "the account has nothing to say" and keeps whatever the
     * browser holds; an empty object would overwrite wording he had typed on this machine the first
     * time he opened the panel on it, which is the exact loss this endpoint exists to prevent.
     */
    const res = (await get(getEvent({ userId: '46' }), {} as never, {} as never)) as { body: string };
    expect(readBody(res).data).toBeNull();
  });

  it('answers what he stored', async () => {
    findUnique.mockResolvedValue({ templates: { en: EN } });
    const res = (await get(getEvent({ userId: '46' }), {} as never, {} as never)) as { body: string };
    expect(readBody(res).data.en.email.above).toBe('Hello,');
  });

  it('refuses without a user id rather than reading somebody else', async () => {
    const res = (await get(getEvent({}), {} as never, {} as never)) as { statusCode: number };
    expect(res.statusCode).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('answers null when the stored value is not an object', async () => {
    // A row written by hand, or by a version that stored a string. Null is the honest reading.
    findUnique.mockResolvedValue({ templates: 'nonsense' });
    const res = (await get(getEvent({ userId: '46' }), {} as never, {} as never)) as { body: string };
    expect(readBody(res).data).toBeNull();
  });
});

describe('PATCH share-templates', () => {
  it('stores what it is given, keyed to the renter', async () => {
    const res = (await patch(patchEvent({ userId: 46, en: EN }), {} as never, {} as never)) as { body: string };

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].where.tenantId_userId.userId).toBe(46);
    expect(readBody(res).data.en.email.above).toBe('Hello,');
  });

  it('REPLACES the language it names, so a deleted line stays deleted', async () => {
    /**
     * ⚠️ A deep merge would make "he removed his sign-off" indistinguishable from "that field was
     * not sent", and his delete would silently come back on the next read.
     */
    findUnique.mockResolvedValue({ templates: { en: { email: { above: 'Old', below: 'Old sign-off' } } } });

    await patch(patchEvent({ userId: 46, en: { email: { above: 'New' } } }), {} as never, {} as never);

    const stored = upsert.mock.calls[0][0].update.templates;
    expect(stored.en.email.above).toBe('New');
    expect(stored.en.email.below).toBeUndefined();
  });

  it('LEAVES ALONE the language it does not name', async () => {
    // A caller editing in English must not wipe his Arabic wording by omission.
    findUnique.mockResolvedValue({ templates: { en: EN, ar: AR } });

    await patch(patchEvent({ userId: 46, en: { email: { above: 'New' } } }), {} as never, {} as never);

    expect(upsert.mock.calls[0][0].update.templates.ar.email.above).toBe('مرحباً،');
  });

  it('takes an empty body as nothing to say, not as a wipe', async () => {
    findUnique.mockResolvedValue({ templates: { en: EN } });
    const res = (await patch(patchEvent({ userId: 46 }), {} as never, {} as never)) as { body: string };

    expect(upsert).not.toHaveBeenCalled();
    expect(readBody(res).data.en.email.above).toBe('Hello,');
  });

  it('refuses a blob past the cap rather than handing it to the database', async () => {
    const huge = { email: { above: 'x'.repeat(70_000) } };
    const res = (await patch(patchEvent({ userId: 46, en: huge }), {} as never, {} as never)) as { statusCode: number };

    // 422 here: the per-field length in zod refuses it before the byte cap is reached. Either way
    // the point is the same and it is the only point that matters — nothing goes to the database.
    expect(res.statusCode).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('accepts a channel with only SOME fields, and an unknown key is stripped', async () => {
    /**
     * ⚠️ Every field is optional on purpose. A web version that learns a fourth field must not need
     * this deployed first, and one that drops a field must not 400 — his wording would be refused
     * over a shape, which is the one failure a renter cannot work around.
     */
    await patch(
      patchEvent({ userId: 46, en: { whatsapp: { above: 'Short', nonsense: 'x' } } }),
      {} as never,
      {} as never,
    );

    const stored = upsert.mock.calls[0][0].update.templates;
    expect(stored.en.whatsapp).toEqual({ above: 'Short' });
  });

  it('refuses a body with no user id', async () => {
    const res = (await patch(patchEvent({ en: EN }), {} as never, {} as never)) as { statusCode: number };
    expect(res.statusCode).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

### 7 · The web side

Three pieces, all removed with this note and all small:

- `src/app/api/me/share-templates/route.ts` — `GET` and `PUT`, relaying to
  `/renter-suppliers/share-templates` (`PUT` upstream is a `PATCH`).
- `src/lib/shareTemplate.ts` — `fetchAccountTemplates()` (never throws, answers `null` on any
  failure), `saveAccountTemplates()` (never awaited, never surfaced as an error), `loadStore()`.
- `src/components/share/ShareRequestPanel.tsx` — read the account once on mount AFTER the browser
  copy has already drawn, and a 900ms debounced write on edit.

⚠️ **The browser copy is not a cache to be tidied away when this lands.** It is what makes an edit
survive a failed request, a dead network, and a backend that has not shipped. The account copy is
the one that travels; the browser copy is the one that cannot be lost.

---

## Deploy order, when it happens

1. Apply the migration to the stage's database. Additive, no backfill, nothing dropped.
2. `npm run deploy:partners:staging` from `apps/backend-agents`.

⚠️ Migration first. The handler's first query otherwise hits a table that does not exist.

⚠️ That command redeploys the **whole partners Lambda**, so every `renter-suppliers` route goes with
it, not just these two.
