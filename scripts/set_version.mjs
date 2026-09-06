#!/usr/bin/env node
/**
 * set_version.mjs — write one version into every place that states one.
 *
 * The release workflow computes the next semantic version from conventional commits. That
 * number then has to reach three different kinds of surface or they drift apart, which is
 * exactly what happened once already: the tagger published v1.1.0 while package.json still
 * said 1.0.0 and the landing page — which the test reads from package.json — displayed
 * v1.0.0. Three surfaces, two answers, no single owner.
 *
 * So the computed version is written here, in the same commit that gets tagged, and
 * `test/web.test.mjs` fails the build if any published page disagrees with package.json.
 *
 *   node scripts/set_version.mjs 1.2.0
 *   node scripts/set_version.mjs 1.2.0 --check    verify only, change nothing
 *
 * Exit 0 = every surface states the given version, 1 = it does not (with --check), or the
 * files were rewritten (without).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');
const raw = process.argv[2];

if (!raw || !/^v?\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(raw)) {
  console.error('usage: set_version.mjs <x.y.z> [--check]');
  process.exit(2);
}
const version = raw.replace(/^v/, '');

/** Every published surface that prints a version stamp. */
const SURFACES = ['web/index.html', 'web/404.html', 'web/pitch/index.html'];
const STAMP = /v\d+\.\d+\.\d+(?:-[\w.]+)?/g;

const changed = [];

// package.json is the source of truth the tests and the release read back.
{
  const p = join(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(p, 'utf8'));
  if (pkg.version !== version) {
    changed.push(`package.json ${pkg.version} -> ${version}`);
    if (!CHECK) {
      // Rewrite the line rather than re-serialising, so key order and formatting survive.
      const src = readFileSync(p, 'utf8');
      writeFileSync(p, src.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`));
    }
  }
}

for (const rel of SURFACES) {
  const file = join(ROOT, rel);
  const src = readFileSync(file, 'utf8');
  const stale = [...new Set(src.match(STAMP) || [])].filter((v) => v !== `v${version}`);
  if (!stale.length) continue;
  changed.push(`${rel} ${stale.join(', ')} -> v${version}`);
  if (!CHECK) writeFileSync(file, src.replace(STAMP, `v${version}`));
}

if (!changed.length) {
  console.log(`  ✓ every surface already states v${version}`);
  process.exit(0);
}

console.log(CHECK ? `\n  ✗ ${changed.length} surface(s) disagree with v${version}:\n`
                  : `\n  set to v${version}:\n`);
for (const c of changed) console.log('   ' + (CHECK ? '✗ ' : '· ') + c);
console.log('');
process.exit(CHECK ? 1 : 0);
