#!/usr/bin/env node
/**
 * Read-only account health assessment against a Moedatech backend database.
 *
 * Usage:  node scripts/account-health.cjs <phone> [prod|staging]
 * Example: node scripts/account-health.cjs +966502003517 prod
 *
 * Reads DATABASE_URL out of the sibling backend repo's env file and never prints it.
 * Runs SELECTs only. There is no code path in this file that writes, updates or deletes.
 *
 * Why Prisma and not mysql2: the backend repo has no mysql2 installed, but it does
 * carry a generated Prisma client, and $queryRawUnsafe with bound parameters is the
 * cheapest way to reach the same connection string.
 */
const fs = require('fs');
const path = require('path');

const PHONE_ARG = process.argv[2];
const STAGE = (process.argv[3] || 'prod').toLowerCase();
if (!PHONE_ARG) {
  console.error('usage: node scripts/account-health.cjs <phone> [prod|staging]');
  process.exit(2);
}

const BACKEND = path.resolve(__dirname, '..', '..', 'Moedatech-App', 'apps', 'backend');
const ENV_FILE = path.join(BACKEND, STAGE === 'prod' ? '.env.prod' : '.env.staging');

const envRaw = fs.readFileSync(ENV_FILE, 'utf8');
const url = (envRaw.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m) || [])[1];
if (!url) {
  console.error('no DATABASE_URL in ' + ENV_FILE);
  process.exit(1);
}
process.env.DATABASE_URL = url;

const { PrismaClient } = require(path.join(BACKEND, 'node_modules', '@prisma', 'client'));
const prisma = new PrismaClient();

/** Last 9 digits — matches whatever prefix/format `users.contact_number` was stored in. */
const digits = PHONE_ARG.replace(/\D/g, '');
const tail = digits.slice(-9);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);
const J = (x) => JSON.stringify(x, (k, v) => num(v), 1);
const q = (sql, ...args) => prisma.$queryRawUnsafe(sql, ...args);

const out = [];
const say = (mark, label, detail) => out.push(`${mark}  ${label}${detail ? ' — ' + detail : ''}`);

(async () => {
  const users = await q(
    'SELECT id, tenant_id, first_name, last_name, city, job_title, email, whatsapp, ' +
      'has_completed_onboarding, supplier_status, is_verified, company_id, contact_number, ' +
      'open_request_count, has_used_first_request_slot, active_role, is_rentee, is_supplier, ' +
      'language, created_at, updated_at ' +
      'FROM users WHERE contact_number LIKE ? ORDER BY created_at DESC LIMIT 5',
    '%' + tail + '%',
  );

  if (!users.length) {
    console.log('NO ACCOUNT matching ' + PHONE_ARG + ' (searched contact_number LIKE %' + tail + '%)');
    await prisma.$disconnect();
    return;
  }
  if (users.length > 1) {
    console.log('WARNING: ' + users.length + ' accounts match this number. Reporting the newest.');
    console.log(J(users.map((u) => ({ id: u.id, phone: u.contact_number, created: u.created_at }))));
  }

  const u = users[0];
  console.log('ACCOUNT ' + u.id + ' — ' + [u.first_name, u.last_name].filter(Boolean).join(' '));
  console.log(J(u));

  // ---- tier, exactly as backend/src/services/profile.service.ts::getUserTier ----
  let company = null;
  if (u.company_id) {
    const rows = await q(
      'SELECT id, name, is_verified, deleted_at FROM companies WHERE id = ?',
      u.company_id,
    );
    company = rows[0] || null;
    console.log('COMPANY:', J(company));
  }
  const identityComplete = !!(u.first_name && u.last_name && u.city && u.job_title);
  const tier =
    u.supplier_status === 2 || (company && company.is_verified && !company.deleted_at)
      ? 'verified'
      : identityComplete
        ? 'basic'
        : 'guest';
  console.log('TIER: ' + tier + (u.supplier_status !== 2 && tier === 'verified' ? ' (inherited from company)' : ''));

  // ---- 1. can he POST a request? ----
  if (u.tenant_id !== 'default') {
    say('FAIL', 'tenant_id = ' + u.tenant_id, 'backend-agents pins TENANT_ID to "default" by omission; it cannot see this row');
  } else {
    say('OK  ', 'tenant_id = default');
  }

  if (!u.has_completed_onboarding) {
    say('FAIL', 'has_completed_onboarding = 0', 'createRequest refuses with GUEST_CANNOT_POST_REQUESTS / E10001');
    if (identityComplete) {
      say('FAIL', 'STUCK ACCOUNT', 'identity complete so he reads as ' + tier + ', but the flag is false. No admin action unsticks this: forceBasicTier throws "already Basic", forceVerifiedTier does not write the flag.');
    }
  } else {
    say('OK  ', 'has_completed_onboarding = 1', 'post gate clear');
  }

  const live = await q(
    'SELECT COUNT(*) n FROM equipment_requests WHERE tenant_id = ? AND rentee_id = ? ' +
      "AND status IN ('OPEN','ACTIVE','PARTIALLY_ACCEPTED') AND deleted_at IS NULL",
    u.tenant_id,
    u.id,
  );
  const liveCount = num(live[0].n);
  if (u.supplier_status === 2) {
    say('OK  ', 'open-request cap', 'not applied (supplier_status = 2); ' + liveCount + ' live');
  } else if (liveCount >= 3) {
    say('FAIL', 'open-request cap reached', liveCount + '/3 live — REQUEST_LIMIT_REACHED on the next post');
  } else {
    say('OK  ', 'open-request cap', liveCount + '/3 live');
  }

  const byStatus = await q(
    'SELECT status, COUNT(*) n FROM equipment_requests WHERE rentee_id = ? AND deleted_at IS NULL GROUP BY status',
    u.id,
  );
  console.log('REQUESTS by status:', J(byStatus));

  const byOrigin = await q(
    'SELECT request_origin, is_trial, COUNT(*) n FROM equipment_requests ' +
      'WHERE rentee_id = ? AND deleted_at IS NULL GROUP BY request_origin, is_trial',
    u.id,
  );
  console.log('REQUESTS by origin:', J(byOrigin));

  // ---- app <-> web divergence. One database, two services, and they do not agree. ----

  // The APP's home screen reads the denormalised column; backend-agents COUNTS rows.
  // Both services maintain the column, so a missed decrement shows the renter a number
  // on his phone that nothing on the web agrees with.
  if (num(u.open_request_count) !== liveCount) {
    say(
      'WARN',
      'open_request_count drift',
      'column says ' + num(u.open_request_count) + ', live rows say ' + liveCount +
        ' — the app home screen reads the column, the web counts rows',
    );
  } else {
    say('OK  ', 'open_request_count', 'column agrees with the live rows (' + liveCount + ')');
  }

  // 🔴 The cap is WEB-ONLY. apps/backend removed it (`request.service.ts`: "Request-count cap
  // removed: all onboarded rentees can post unlimited simultaneous requests"), backend-agents
  // still enforces 3. So the same person is refused in the browser and served in the app.
  if (u.supplier_status !== 2 && liveCount >= 3) {
    say(
      'FAIL',
      'capped on WEB, allowed in APP',
      liveCount + ' live — backend-agents refuses with E8009, apps/backend has no cap. He can post the same request from his phone.',
    );
  }

  // ---- 2. can he SEND an email share? ----
  if (u.email && EMAIL_RE.test(String(u.email).trim())) {
    say('OK  ', 'users.email set', String(u.email) + ' — SES has a From address');
  } else {
    say('WARN', 'users.email empty', 'SES path refuses with NO_SENDER_ADDRESS; only a connected Outlook mailbox can send');
  }

  // Reads use BOTH scope keys — renter-supplier.service.ts:46
  const scopes = (u.company_id ? [u.company_id] : []).concat(['u:' + u.id]);
  const sup = await q(
    'SELECT id, scope_key, name, email, phone_e164, supplier_user_id FROM renter_suppliers ' +
      'WHERE scope_key IN (' + scopes.map(() => '?').join(',') + ')',
    ...scopes,
  );

  // Mirror addressesFor(): the row's own address first, the linked account's as fallback.
  const linkedIds = [...new Set(sup.map((r) => r.supplier_user_id).filter((v) => v != null))];
  const linked = new Map();
  if (linkedIds.length) {
    const rows = await q(
      'SELECT id, email FROM users WHERE id IN (' + linkedIds.map(() => '?').join(',') + ')',
      ...linkedIds,
    );
    for (const r of rows) linked.set(num(r.id), r.email);
  }
  const emailable = sup.filter((r) => {
    const e = (r.email ?? (r.supplier_user_id != null ? linked.get(num(r.supplier_user_id)) : null) ?? '')
      .toString()
      .trim()
      .toLowerCase();
    return e && EMAIL_RE.test(e);
  });

  console.log('SUPPLIERS (' + sup.length + ' rows over scopes ' + scopes.join(', ') + '):');
  console.log(
    J(
      sup.map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone_e164,
        linked_account: r.supplier_user_id,
        linked_email: r.supplier_user_id != null ? linked.get(num(r.supplier_user_id)) ?? null : null,
      })),
    ),
  );

  if (!sup.length) {
    say('WARN', 'no supplier rows', 'nothing to share to yet — he adds them in the flow');
  } else if (!emailable.length) {
    say('FAIL', 'no supplier is emailable', sup.length + ' rows, 0 with a usable address (own or linked) — share-email answers NO_RECIPIENTS and nothing leaves');
  } else {
    say('OK  ', 'emailable suppliers', emailable.length + ' of ' + sup.length);
  }

  // ---- 3. activity, for context ----
  const bids = await q(
    'SELECT COUNT(*) n FROM bids b JOIN equipment_requests r ON r.id = b.request_id ' +
      'WHERE r.rentee_id = ? AND r.deleted_at IS NULL',
    u.id,
  ).catch(() => null);
  if (bids) console.log('BIDS received across his requests: ' + num(bids[0].n));

  console.log('\n================ VERDICT ================');
  for (const line of out) console.log(line);
  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(
    '\n' + (fails ? fails + ' blocking issue(s)' : 'No blocking issue') + ' for account ' + u.id + '.',
  );
  console.log('NOT covered here: the Outlook token lives in SSM, not the database — see the skill for the one command that reads it.');

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('ERR', e.code || '', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
