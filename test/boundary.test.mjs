/**
 * The permission boundary.
 *
 * Most projects *configure* a safety boundary and never test that it holds. This project's
 * boundary is not a bucket ACL — it is the rule that decides whether a stranger's phone
 * rings. From references/safety.md:
 *
 *   - a number is dialled only if it is E.164 AND carries a published source AND a date
 *     a human checked it
 *   - one call per office, per procedure, per day
 *   - the default path places no call at all
 *
 * These tests drive the shipped entry points as subprocesses and assert the boundary is
 * real rather than documented. Every case here is an attempt to get the tool to dial
 * something it must refuse.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateOffice, idempotencyKey } from '../skills/countercall/scripts/_lib.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CALL = 'skills/countercall/scripts/call.mjs';

async function attempt(args, env = {}) {
  try {
    const { stdout, stderr } = await run('node', [CALL, ...args], {
      cwd: ROOT,
      env: { ...process.env, CALLE_API_KEY: '', COUNTERCALL_GOAL_ID: '', ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

/** Write a one-office seed file into a temp dir and return its path. */
function seed(office) {
  const dir = mkdtempSync(join(tmpdir(), 'countercall-'));
  const path = join(dir, 'offices.json');
  writeFileSync(path, JSON.stringify([{ id: 'target', name: 'T', city: 'C', procedures: ['p'], ...office }]));
  return path;
}

/** Every shape of unusable number the boundary must refuse. */
const FORBIDDEN = [
  ['a placeholder number', { phone_e164: '+62XXXXXXXXXX', source_url: 'https://x.invalid/', source_checked: '2026-09-03' }],
  ['a local-format number', { phone_e164: '0211234567', source_url: 'https://x.invalid/', source_checked: '2026-09-03' }],
  ['a number with no source', { phone_e164: '+622112345678', source_url: null, source_checked: '2026-09-03' }],
  ['a number nobody checked', { phone_e164: '+622112345678', source_url: 'https://x.invalid/', source_checked: null }],
  ['a number with spaces', { phone_e164: '+62 21 1234 5678', source_url: 'https://x.invalid/', source_checked: '2026-09-03' }],
  ['a number with an extension', { phone_e164: '+622112345678x21', source_url: 'https://x.invalid/', source_checked: '2026-09-03' }],
  ['a leading-zero country code', { phone_e164: '+0211234567', source_url: 'https://x.invalid/', source_checked: '2026-09-03' }],
  ['an empty number', { phone_e164: '', source_url: 'https://x.invalid/', source_checked: '2026-09-03' }],
  ['a missing number', { source_url: 'https://x.invalid/', source_checked: '2026-09-03' }],
];

describe('permission boundary — the tool refuses to dial', () => {
  for (const [description, office] of FORBIDDEN) {
    test(`refuses ${description}, even with --live and full credentials`, async () => {
      // The strongest form of the check: credentials present, --live requested, and the
      // boundary must still hold. If it exits 3 it never reached the SDK.
      const { code, stderr } = await attempt(
        ['--offices', seed(office), '--office', 'target', '--procedure', 'p', '--live'],
        { CALLE_API_KEY: 'sk-present', COUNTERCALL_GOAL_ID: 'goal_present' },
      );
      assert.equal(code, 3, 'must exit 3 — refused before the dialler');
      assert.ok(stderr.includes('REFUSING TO DIAL'));
    });
  }

  test('refuses an office that is not in the seed file at all', async () => {
    const { code, stderr } = await attempt(
      ['--offices', seed({ phone_e164: '+622112345678', source_url: 'https://x.invalid/', source_checked: '2026-09-03' }),
        '--office', 'some-other-office', '--procedure', 'p', '--live'],
      { CALLE_API_KEY: 'sk-present', COUNTERCALL_GOAL_ID: 'goal_present' },
    );
    assert.equal(code, 3);
    assert.ok(stderr.includes('office not found'));
  });

  test('the boundary is enforced in the library, not only in the CLI', () => {
    // A caller importing validateOffice directly must get the same verdict, so the rule
    // cannot be bypassed by using the module instead of the entry point.
    for (const [, office] of FORBIDDEN) {
      assert.ok(validateOffice(office).length > 0);
    }
  });
});

describe('permission boundary — rate discipline', () => {
  test('the idempotency key pins one call per office, per procedure, per day', () => {
    const monday = idempotencyKey('imigrasi-jaksel', 'perpanjangan paspor', '2026-09-07');
    assert.equal(monday, idempotencyKey('imigrasi-jaksel', 'perpanjangan paspor', '2026-09-07'));
    assert.notEqual(monday, idempotencyKey('imigrasi-jaksel', 'perpanjangan paspor', '2026-09-08'));
    assert.notEqual(monday, idempotencyKey('imigrasi-jakbar', 'perpanjangan paspor', '2026-09-07'));
    assert.notEqual(monday, idempotencyKey('imigrasi-jaksel', 'paspor baru', '2026-09-07'));
  });

  test('casing and spacing cannot mint a second call to the same counter', () => {
    // A retry that mints a fresh key is a bug, not a workaround — these are queues with
    // real people in them.
    const canonical = idempotencyKey('o', 'perpanjangan paspor', '2026-09-07');
    for (const variant of ['Perpanjangan Paspor', 'PERPANJANGAN PASPOR', '  perpanjangan   paspor  ']) {
      assert.equal(idempotencyKey('o', variant, '2026-09-07'), canonical);
    }
  });
});

describe('permission boundary — the default path places no call', () => {
  const good = { phone_e164: '+622112345678', source_url: 'https://x.invalid/', source_checked: '2026-09-03' };

  test('a fully valid office still does not dial without --live', async () => {
    const { code, stdout } = await attempt(
      ['--offices', seed(good), '--office', 'target', '--procedure', 'p'],
      { CALLE_API_KEY: 'sk-present', COUNTERCALL_GOAL_ID: 'goal_present' },
    );
    assert.equal(code, 0);
    assert.ok(stdout.includes('DRY RUN'));
    assert.ok(stdout.includes('no call placed'));
  });

  test('--live without a key fails closed rather than dialling', async () => {
    const { code, stderr } = await attempt(
      ['--offices', seed(good), '--office', 'target', '--procedure', 'p', '--live'],
    );
    assert.equal(code, 4);
    assert.ok(stderr.includes('CALLE_API_KEY'));
  });

  test('--live on the goals transport without a Goal fails closed rather than dialling', async () => {
    const { code, stderr } = await attempt(
      ['--offices', seed(good), '--office', 'target', '--procedure', 'p', '--live',
        '--transport', 'goals'],
      { CALLE_API_KEY: 'sk-present' },
    );
    assert.equal(code, 4);
    assert.ok(stderr.includes('COUNTERCALL_GOAL_ID'));
  });

  /*
   * The Calls transport needs only a key, so it does NOT inherit the two-credential
   * interlock the Goals path had. That interlock was incidental, not designed — the real
   * boundary has always been `--live` plus a sourced number, and these two cases assert it
   * still holds on the transport that lost the accident.
   */
  test('the calls transport still will not dial without --live', async () => {
    const { code, stdout } = await attempt(
      ['--offices', seed(good), '--office', 'target', '--procedure', 'p', '--transport', 'calls'],
      { CALLE_API_KEY: 'sk-present' },
    );
    assert.equal(code, 0);
    assert.ok(stdout.includes('DRY RUN'));
    assert.ok(stdout.includes('no call placed'));
  });

  test('the calls transport still will not dial an unsourced number, key or no key', async () => {
    const unsourced = { phone_e164: '+622112345678', source_url: null, source_checked: null };
    const { code, stderr } = await attempt(
      ['--offices', seed(unsourced), '--office', 'target', '--procedure', 'p', '--live',
        '--transport', 'calls'],
      { CALLE_API_KEY: 'sk-present' },
    );
    assert.equal(code, 3);
    assert.ok(stderr.includes('REFUSING TO DIAL'));
    assert.ok(stderr.includes('no source_url'));
  });
});
