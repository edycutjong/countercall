#!/usr/bin/env node
/**
 * check_counts.mjs — every surface that quotes the test count must quote the real one.
 *
 * The suite grew from 182 to 232 across three sessions and the documented figure was left
 * at 210 in **14 places** across the README badge, the landing page, the deck, JUDGE.md and
 * DEMO.md. A judge who runs `npm test` and sees a different number than the badge has found
 * a small lie, and small lies are the ones that get checked.
 *
 * This derives the count by actually running the suite, then greps every judged surface.
 *
 *   node scripts/check_counts.mjs
 *   node scripts/check_counts.mjs --fix     rewrite the surfaces to match
 *
 * Exit 0 = consistent, 1 = drift.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIX = process.argv.includes('--fix');

/** Surfaces a judge can read, and the count each is allowed to quote. */
const SURFACES = ['README.md', 'JUDGE.md', 'DEMO.md', 'web/index.html', 'web/pitch/index.html'];

/**
 * The files the suite actually runs. Mirrors package.json's `node --test test/*.test.mjs`.
 *
 * Both used to pass a recursive `test` glob to node as a literal string. Node only
 * expands globs in --test from v21, so on the Node 20 leg of the CI matrix the runner was
 * handed a path that does not exist and exited 1 — while package.json's `engines` and the
 * README badge both advertise Node >= 20. Shell expansion and readdir agree on every
 * version; fs.globSync would not, since it lands in Node 22.
 */
function testFiles() {
  return readdirSync(join(ROOT, 'test'))
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => join('test', f));
}

/** Run the suite and take the count from its own output — never from a constant. */
function actualTestCount() {
  let out;
  try {
    out = execFileSync('node', ['--test', ...testFiles()], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    out = (e.stdout ?? '') + (e.stderr ?? '');
  }
  const m = out.match(/^# tests (\d+)/m);
  if (!m) throw new Error('could not read "# tests N" from the runner output');
  return Number(m[1]);
}

const actual = actualTestCount();
/**
 * Only numbers genuinely adjacent to the word "test" are claims about the suite.
 *
 * A looser pattern matched `650` from "Rp 650.000", `520` from "11,520 contract cases",
 * and stray CSS pixel values — 22 false positives on the first run. A checker that cries
 * wolf gets muted, which is worse than not having one.
 */
const CLAIMS = [
  /(\d{3,4})\s*(?:<[^>]+>\s*)*tests?\b/gi,          // "232 tests", "<b>232</b> tests"
  /tests?[-_\s]*(\d{3,4})[-_\s]*passing/gi,          // shields.io badge
  /\|\s*Tests\s*\|\s*\*\*(\d{3,4})\*\*/gi,        // "| Tests | **232**"
  // The runner prints the count AFTER the word, and pasted transcripts carry it.
  // The forward-only patterns above reported "every surface agrees" while a
  // transcript in DEMO.md still said 232 — a false negative is worse than a noisy
  // check, because it is silent.
  /^#\s*(?:tests|pass)\s+(\d{3,4})\s*$/gim,
  // A count-up animation overwrites its own element's text, so the number a judge
  // actually reads is the ATTRIBUTE, not the markup. web/index.html shipped
  // data-count="232" wrapping a literal 233: every forward pattern above matched the
  // 233 and reported agreement, while the rendered page counted up to 232.
  /data-count=["'](\d{3,4})["'][^>]*>[^<]*<\/div><div class="l">\s*tests\b/gi,
];

const findings = [];
for (const rel of SURFACES) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) continue;
  const src = readFileSync(file, 'utf8');
  let fixed = src;

  for (const pattern of CLAIMS) {
    for (const m of src.matchAll(pattern)) {
      const claimed = Number(m[1]);
      if (claimed === actual) continue;
      findings.push(`${rel}: claims ${claimed} tests, actual is ${actual}`);
      if (FIX) {
        fixed = fixed.split(m[0]).join(m[0].replace(String(claimed), String(actual)));
      }
    }
  }
  if (FIX && fixed !== src) writeFileSync(file, fixed);
}

if (findings.length) {
  console.log(`\n  test count is ${actual}; ${findings.length} surface claim(s) disagree:\n`);
  [...new Set(findings)].forEach((f) => console.log('   ✗ ' + f));
  console.log(FIX ? '\n  --fix applied. Re-run to confirm.\n'
                  : '\n  Re-run with --fix to correct them.\n');
  process.exit(1);
}
console.log(`\n  ✓ every surface agrees: ${actual} tests\n`);
