#!/usr/bin/env node
/**
 * check_no_dial.mjs — no test may reach the dialler.
 *
 * This replaces a CI grep that failed the moment the repo was first pushed:
 *
 *     if grep -rn -- "--live" test/ | grep -v "must never\|no test\|..."
 *
 * The intent was right and the implementation could not express it. The permission-boundary
 * suite passes `--live` **on purpose** — with credentials present — because the property
 * under test is that the tool refuses anyway. The allowlist matched explanatory phrases on
 * the same physical line, but the real occurrences are argument arrays several lines away
 * from the sentence describing them, so the guard flagged the very suite that proves the
 * boundary holds.
 *
 * The invariant that actually matters is not "the string --live is absent". It is:
 *
 *   1. No test references `goals.run` — the only SDK method that makes a phone ring.
 *   2. Any test that spawns a process with `--live` must assert a NON-ZERO exit, i.e. it
 *      must prove the run was refused before the dialler was reached.
 *
 * A test that passes `--live` to a pure function (`parseArgs(['--live'])`) spawns nothing and
 * cannot dial, so it is not subject to rule 2.
 *
 *   node scripts/check_no_dial.mjs
 *
 * Exit 0 = no test can dial, 1 = a test might.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEST_DIR = join(ROOT, 'test');

/** The SDK call that actually dials. Nothing under test/ may name it. */
const DIAL_CALL = /\bgoals\s*\.\s*run\s*\(/;

/** A test spawns a subprocess through one of these helpers. */
const SPAWNS = /\b(?:attempt|cli)\s*\(/;

/**
 * `--live` as an actual ARGUMENT, not as prose.
 *
 * Matching the bare string caught two false positives: a test *named*
 * "…does not dial without --live", which asserts exit 0 because it is the dry-run path,
 * and a file preamble whose comment says no test may pass --live. Only a quoted token in
 * an argv array is a request to go live.
 */
const LIVE_ARG = /['"`]--live['"`]/;

/** Proof the run was refused: an exit-code assertion with a non-zero value. */
const REFUSED = /assert\s*\.\s*equal\s*\(\s*code\s*,\s*[1-9]\d*/;

const failures = [];
let spawningLiveTests = 0;

for (const file of readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.mjs')).sort()) {
  const src = readFileSync(join(TEST_DIR, file), 'utf8');

  // Rule 1 — ignore matches inside comments, which legitimately discuss the dialler.
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    if (DIAL_CALL.test(code)) failures.push(`${file}:${i + 1} references goals.run()`);
  });

  // Rule 2 — split into test blocks and check the ones that both spawn and go live.
  //          Splitting on the `test(` boundary is enough: these files never nest test().
  const blocks = src.split(/(?=\btest\s*\()/);
  for (const block of blocks) {
    if (!/^test\s*\(/.test(block)) continue;   // the file preamble, not a test
    if (!LIVE_ARG.test(block)) continue;
    if (!SPAWNS.test(block)) continue;         // pure-function test, cannot dial
    spawningLiveTests++;
    if (REFUSED.test(block)) continue;
    const name = block.match(/test\s*\(\s*[`'"]([^`'"]+)/)?.[1] ?? '(unnamed)';
    failures.push(`${file}: test "${name}" spawns with --live and never asserts a non-zero exit`);
  }
}

if (failures.length) {
  console.error('\n  ✗ a test could reach the dialler\n');
  for (const f of failures) console.error(`    ${f}`);
  console.error('\n  Every --live test must prove it was refused before the SDK was called.\n');
  process.exit(1);
}

console.log(`\n  ✓ no test can dial — ${spawningLiveTests} --live tests, all asserting refusal\n`);
