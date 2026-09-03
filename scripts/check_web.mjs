#!/usr/bin/env node
/**
 * check_web.mjs — static checks over web/, with no dependencies.
 *
 * The rendered QA pass (a real browser, three viewports, every deck slide) lives in the
 * kitchen at assets/web-qa.cjs, because Playwright does not belong in a judged repo whose
 * whole runtime is one package. This is the half CI can run: file existence, link
 * integrity, metadata completeness, and the no-fabricated-data rule.
 *
 *   node scripts/check_web.mjs
 *
 * Exit 0 = clean, 1 = findings.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB = join(ROOT, 'web');
const findings = [];
const fail = (file, msg) => findings.push(`${relative(ROOT, file)}: ${msg}`);

/** Comments explain the rules by naming the forbidden figures; strip them first. */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ');

const REQUIRED_FILES = [
  'index.html', 'pitch/index.html', '404.html',
  'icon.svg', 'icon-512.png', 'apple-touch-icon.png', 'og-image.png',
  'site.webmanifest', 'robots.txt', 'sitemap.xml',
];

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

// ── 1. every required file is present ────────────────────────────────────────
for (const rel of REQUIRED_FILES) {
  if (!existsSync(join(WEB, rel))) findings.push(`web/${rel}: missing`);
}
if (!existsSync(WEB)) {
  console.error('web/ does not exist');
  process.exit(1);
}

const pages = htmlFiles(WEB);

for (const file of pages) {
  const raw = readFileSync(file, 'utf8');
  const html = stripComments(raw);

  // ── 2. no fabricated call figures reach a judged surface ───────────────────
  // toLocaleString is how a REAL fee gets formatted at runtime; that is not a render.
  const rendered = html.replace(/toLocaleString\([^)]*\)/g, ' ');
  if (/Rp ?\d/.test(rendered)) fail(file, 'renders a fabricated rupiah figure');
  if (/\d+m\d+s/.test(rendered)) fail(file, 'renders a fabricated call duration');

  // ── 3. local asset references resolve ──────────────────────────────────────
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|data:|#|\/\/)/.test(ref)) continue;
    // Root-absolute paths are resolved by Pages against the site root, which is web/.
    const target = ref.startsWith('/')
      ? join(WEB, ref.replace(/^\/[^/]+\//, ''))   // strip the project-site prefix
      : resolve(dirname(file), ref);
    const candidates = [target, join(target, 'index.html')];
    if (!candidates.some(existsSync)) fail(file, `dead local reference: ${ref}`);
  }

  // ── 4. in-page anchors resolve ─────────────────────────────────────────────
  for (const ref of refs.filter((r) => r.startsWith('#') && r.length > 1)) {
    const id = ref.slice(1);
    if (!new RegExp(`id="${id}"`).test(html)) fail(file, `dead anchor: ${ref}`);
  }

  // ── 5. baseline document hygiene ───────────────────────────────────────────
  if (!/<html[^>]+lang=/.test(html)) fail(file, 'no lang attribute on <html>');
  if (!/<meta[^>]+name="viewport"/.test(html)) fail(file, 'no viewport meta');
  if (!/<title>[^<]{5,}<\/title>/.test(html)) fail(file, 'no usable <title>');
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) fail(file, `${h1s} <h1> elements (want exactly 1)`);
}

// ── 6. the landing page carries a complete social card ───────────────────────
{
  const html = stripComments(readFileSync(join(WEB, 'index.html'), 'utf8'));
  const need = [
    'meta name="description"', 'link rel="canonical"', 'meta name="theme-color"',
    'link rel="manifest"', 'link rel="apple-touch-icon"',
    'meta property="og:title"', 'meta property="og:description"',
    'meta property="og:image"', 'meta property="og:url"', 'meta property="og:image:alt"',
    'meta name="twitter:card"',
  ];
  for (const n of need) if (!html.includes(`<${n}`)) fail(join(WEB, 'index.html'), `missing ${n}`);

  const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? '';
  if (desc.length < 70 || desc.length > 200) {
    fail(join(WEB, 'index.html'), `description ${desc.length} chars (want 70–200)`);
  }
}

// ── 7. the live result slot is null, or a real run ───────────────────────────
{
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  const slot = html.match(/id="call-result"[^>]*>([\s\S]*?)<\/script>/);
  if (!slot) fail(join(WEB, 'index.html'), 'no call-result slot');
  else {
    let payload;
    try { payload = JSON.parse(slot[1].trim()); }
    catch { fail(join(WEB, 'index.html'), 'call-result is not valid JSON'); }
    if (payload && !/^grun_/.test(payload.runId ?? '')) {
      fail(join(WEB, 'index.html'), 'call-result is filled but carries no real CALL-E runId');
    }
  }
}

// ── 8. the deck labels its illustrative values ───────────────────────────────
{
  const deck = readFileSync(join(WEB, 'pitch', 'index.html'), 'utf8');
  if (/Kartu Keluarga asli/.test(deck) && !/not a call recording/i.test(deck)) {
    fail(join(WEB, 'pitch', 'index.html'),
         'shows illustrative call values with no "not a call recording" label');
  }
  const slides = (deck.match(/<section\b(?=[^>]*class="slide)/g) || []).length;
  if (slides !== 10) fail(join(WEB, 'pitch', 'index.html'), `${slides} slides (expected 10)`);
}

if (findings.length) {
  console.log(`\n  ${findings.length} finding(s):\n`);
  findings.forEach((f) => console.log('   ✗ ' + f));
  console.log('');
  process.exit(1);
}
console.log(`\n  ✓ web static checks clean — ${pages.length} pages\n`);
