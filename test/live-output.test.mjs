/**
 * What the live paths print and record when the provider misbehaves.
 *
 * These tests pass `--live`, so they run against a SANDBOX: a copy of `skills/` and
 * `scripts/` in a temp directory whose only `@call-e/calle` is test/fixtures/fake-calle.mjs.
 * The real SDK is not reachable from there, and `before` proves that before any test runs.
 * The fake has no network code and no `goals.run`. check_no_dial.mjs allows `--live` in a
 * `sandboxed(` call for this reason and no other.
 *
 * The sandbox also keeps bench.mjs from writing to the repo's own bench/records.json.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NUMBER = '442079460123';
const KEY = 'sk_fake_sandbox_key_0001';
const ARGS = ['--offices', 'offices.json', '--office', 'fixture-sourced', '--procedure', 'perpanjangan paspor'];

let box;

before(async () => {
  // realpath: on macOS the temp dir is a symlink, and the resolve check below compares paths.
  box = realpathSync(mkdtempSync(join(tmpdir(), 'countercall-sandbox-')));
  cpSync(join(ROOT, 'skills'), join(box, 'skills'), { recursive: true });
  cpSync(join(ROOT, 'scripts'), join(box, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'test/fixtures/offices.test.json'), join(box, 'offices.json'));
  writeFileSync(join(box, 'package.json'), '{ "type": "module" }\n');
  const sdk = join(box, 'node_modules/@call-e/calle');
  mkdirSync(sdk, { recursive: true });
  cpSync(join(ROOT, 'test/fixtures/fake-calle.mjs'), join(sdk, 'index.mjs'));
  writeFileSync(join(sdk, 'package.json'), '{ "name": "@call-e/calle", "type": "module", "main": "index.mjs" }\n');

  // Refuse to run a single --live test unless the SDK the scripts will load is the fake.
  const { stdout } = await run(
    'node', ['--input-type=module', '-e', "console.log(import.meta.resolve('@call-e/calle'))"],
    { cwd: join(box, 'skills/countercall/scripts') },
  );
  assert.equal(fileURLToPath(stdout.trim()), join(sdk, 'index.mjs'));
});

after(() => rmSync(box, { recursive: true, force: true }));

/** Run a script inside the sandbox against the fake SDK, without throwing on a non-zero exit. */
async function sandboxed(script, args, mode) {
  const env = {
    ...process.env, CALLE_API_KEY: KEY, COUNTERCALL_GOAL_ID: '', COUNTERCALL_TRANSPORT: 'calls',
    FAKE_CALLE_MODE: mode,
  };
  try {
    const { stdout, stderr } = await run('node', [script, ...args], { cwd: box, env });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    return { code: error.code, out: (error.stdout ?? '') + (error.stderr ?? '') };
  }
}

/** Nothing the provider sent may reach the terminal or the records file unfiltered. */
function assertClean(text) {
  assert.ok(!text.includes(NUMBER), 'the whole destination number was printed');
  assert.ok(!text.includes(KEY), 'the API key was printed');
  assert.ok(!text.includes('\u001b'), 'a terminal escape sequence was printed');
  assert.ok(!/^REFUSING TO DIAL: forged/m.test(text), 'provider text forged a line of output');
}

describe('call.mjs --live prints provider output safely', () => {
  test('an SDK error is sanitised before it is printed', async () => {
    const { code, out } = await sandboxed('skills/countercall/scripts/call.mjs', [...ARGS, '--live'], 'create-throws');
    assert.equal(code, 1);
    assert.ok(out.includes('upstream 502'));
    assertClean(out);
  });

  test('the dial line masks the destination', async () => {
    const { out } = await sandboxed('skills/countercall/scripts/call.mjs', [...ARGS, '--live'], 'create-throws');
    assert.ok(out.includes('Dialling +44*******123'));
  });

  test('a vendor failure code is sanitised on the failure card', async () => {
    const { code, out } = await sandboxed('skills/countercall/scripts/call.mjs', [...ARGS, '--live'], 'failure-code');
    assert.equal(code, 5);
    assert.ok(out.includes('sip_486_to_+44*******123'));
    assertClean(out);
  });

  test('the card keeps the document lines and masks the number the clerk repeated', async () => {
    const { code, out } = await sandboxed('skills/countercall/scripts/call.mjs', [...ARGS, '--live'], 'result');
    assert.equal(code, 0);
    assert.ok(out.includes('Passport'));
    assert.ok(out.includes('Photograph'));
    assert.ok(out.includes('+44*******123'));
    assertClean(out);
  });
});

describe('bench.mjs --live records provider output safely', () => {
  // bench.mjs commits its records, so what it writes matters as much as what it prints.
  function records() {
    const text = readFileSync(join(box, 'bench/records.json'), 'utf8');
    // JSON writes an escape character as the six characters \u001b, so look for those too.
    assert.ok(!text.includes('\\u001b'), 'a terminal escape sequence was recorded');
    return text;
  }

  test('an error thrown mid-call is sanitised in the records file', async () => {
    rmSync(join(box, 'bench'), { recursive: true, force: true });
    const { code, out } = await sandboxed('scripts/bench.mjs', ['--live', '--calls', '1', '--offices', 'offices.json'], 'wait-throws');
    assert.equal(code, 0);
    const written = records();
    assert.ok(written.includes('poll failed'));
    assertClean(written);
    assertClean(out);
  });

  test('a vendor failure code is sanitised in the records file', async () => {
    rmSync(join(box, 'bench'), { recursive: true, force: true });
    const { code, out } = await sandboxed('scripts/bench.mjs', ['--live', '--calls', '1', '--offices', 'offices.json'], 'failure-code');
    assert.equal(code, 0);
    const written = records();
    assert.ok(written.includes('sip_486_to_+44*******123'));
    assertClean(written);
    assertClean(out);
  });
});
