/**
 * The CLI contract, exercised as a subprocess.
 *
 * These are the tests that matter most for safety: they assert that the shipped entry
 * points refuse to dial, and that the default path places no call. Testing the exported
 * functions alone would prove the logic is right while leaving the wiring untested.
 *
 * No test in this file may ever pass `--live`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = 'test/fixtures/offices.test.json';

const CALL = 'skills/countercall/scripts/call.mjs';
const PREFLIGHT = 'skills/countercall/scripts/preflight.mjs';

/** Run a script and capture code/stdout/stderr without throwing on a non-zero exit. */
async function cli(script, args, env = {}) {
  try {
    const { stdout, stderr } = await run('node', [script, ...args], {
      cwd: ROOT,
      env: { ...process.env, CALLE_API_KEY: '', COUNTERCALL_GOAL_ID: '', ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

describe('call.mjs is dry by default', () => {
  test('a sourced office produces a dry run, not a call', async () => {
    const { code, stdout } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    assert.equal(code, 0);
    assert.ok(stdout.includes('DRY RUN'));
  });

  test('the dry run says explicitly that no call was placed', async () => {
    const { stdout } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    assert.ok(stdout.includes('no call placed'));
  });

  test('the dry run prints the exact request, with phone at the top level', async () => {
    const { stdout } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    const request = JSON.parse(stdout.slice(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1));
    assert.equal(request.phone, '+622112345678');
    assert.ok(!('target' in request), 'CreateGoalRunRequest has no target wrapper');
  });

  test('the dry-run request carries a business-stable idempotency key', async () => {
    const { stdout } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    const request = JSON.parse(stdout.slice(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1));
    assert.match(request.idempotencyKey, /^countercall:fixture-sourced:perpanjangan-paspor:\d{4}-\d{2}-\d{2}:v1$/);
  });

  test('the dry-run request sends no personal data as variables', async () => {
    const { stdout } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    const request = JSON.parse(stdout.slice(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1));
    assert.deepEqual(Object.keys(request.variables).sort(), ['city', 'office_name', 'procedure']);
  });

  test('the dry run names the number it would ring, so a mistake is visible first', async () => {
    const { stdout } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    assert.ok(stdout.includes('would ring +622112345678'));
  });
});

describe('call.mjs refuses to dial', () => {
  test('a placeholder number is refused', async () => {
    const { code, stderr } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-placeholder', '--procedure', 'paspor',
    ]);
    assert.equal(code, 3);
    assert.ok(stderr.includes('REFUSING TO DIAL'));
    assert.ok(stderr.includes('placeholder number'));
  });

  test('a number with no published source is refused', async () => {
    const { code, stderr } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-unsourced', '--procedure', 'paspor',
    ]);
    assert.equal(code, 3);
    assert.ok(stderr.includes('no source_url'));
  });

  test('a local-format number is refused', async () => {
    const { code, stderr } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-local-format', '--procedure', 'paspor',
    ]);
    assert.equal(code, 3);
    assert.ok(stderr.includes('not E.164'));
  });

  test('an office that is not in the seed file is refused', async () => {
    const { code, stderr } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'not-a-real-office', '--procedure', 'paspor',
    ]);
    assert.equal(code, 3);
    assert.ok(stderr.includes('office not found'));
  });

  test('missing arguments exit with the usage code, not a stack trace', async () => {
    const { code, stderr } = await cli(CALL, ['--offices', FIXTURE]);
    assert.equal(code, 2);
    assert.ok(stderr.includes('usage:'));
  });

  test('--live without credentials fails closed rather than dialling', async () => {
    const { code, stderr } = await cli(CALL, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'paspor', '--live',
    ]);
    assert.equal(code, 4);
    assert.ok(stderr.includes('CALLE_API_KEY'));
  });

  test('--live with a key but no published Goal fails closed', async () => {
    const { code, stderr } = await cli(
      CALL,
      ['--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'paspor', '--live'],
      { CALLE_API_KEY: 'sk-not-a-real-key' },
    );
    assert.equal(code, 4);
    assert.ok(stderr.includes('COUNTERCALL_GOAL_ID'));
  });
});

describe('preflight.mjs places no call and needs no credentials', () => {
  test('a sourced office passes preflight', async () => {
    const { code, stdout } = await cli(PREFLIGHT, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    assert.equal(code, 0);
    assert.ok(stdout.includes('Preflight passed'));
  });

  test('preflight states that no call was placed', async () => {
    const { stdout } = await cli(PREFLIGHT, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    assert.ok(stdout.includes('No call was placed'));
  });

  test('the contract check is skipped, not failed, without credentials', async () => {
    const { stdout } = await cli(PREFLIGHT, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    assert.ok(stdout.includes('skipped'));
  });

  test('preflight refuses a placeholder number with its own exit code', async () => {
    const { code, stdout } = await cli(PREFLIGHT, [
      '--offices', FIXTURE, '--office', 'fixture-placeholder', '--procedure', 'paspor',
    ]);
    assert.equal(code, 3);
    assert.ok(stdout.includes('REFUSING TO DIAL'));
  });

  test('preflight shows the idempotency key it would use', async () => {
    const { stdout } = await cli(PREFLIGHT, [
      '--offices', FIXTURE, '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor',
    ]);
    assert.ok(stdout.includes('countercall:fixture-sourced:perpanjangan-paspor:'));
  });
});
