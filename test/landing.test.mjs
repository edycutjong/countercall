/**
 * The landing page is a judged surface, so it gets the same rule as the product:
 * it may not display a value nobody said.
 *
 * `assets/ASSETS.md` blocks the invented `Rp 650.000` / `3m41s` call from the gallery, the
 * README and the video. This suite extends that mechanically to `docs/index.html`, which is
 * what GitHub Pages serves and therefore the first thing a judge sees.
 *
 * These are string assertions over the shipped file rather than DOM tests — the page has no
 * build step and no dependencies, so the file on disk is exactly what ships.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../docs/index.html', import.meta.url)), 'utf8');

/** The page with every HTML comment removed — what actually renders. */
const RENDERED = PAGE.replace(/<!--[\s\S]*?-->/g, ' ');

describe('landing page ships no invented call data', () => {
  test('renders no fabricated rupiah figure', () => {
    // The generator mockups all carry Rp 650.000. It must never reach the served page.
    // `toLocaleString` in the render function is how a REAL fee gets formatted, and is fine.
    const rendered = RENDERED.replace(/toLocaleString\([^)]*\)/g, ' ');
    assert.ok(!/Rp\s?\d/.test(rendered), 'a literal rupiah amount is rendered');
  });

  test('renders no fabricated call duration', () => {
    assert.ok(!/\d+m\d+s/.test(RENDERED), 'a literal call duration is rendered');
  });

  test('the invented figures appear only inside an explanatory comment, if at all', () => {
    if (/650[.,]000|3m41s/.test(PAGE)) {
      assert.ok(!/650[.,]000|3m41s/.test(RENDERED),
        'invented figures escaped the comment and now render');
    }
  });

  test('the live result slot is null until a real call fills it', () => {
    const slot = PAGE.match(/id="call-result"[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(slot, 'the call-result slot must exist');
    const payload = JSON.parse(slot[1].trim());
    // If this ever fails, someone pasted a result in — that is the intended path, but it
    // must be a REAL Goal Run, so the runId assertion below has to pass too.
    if (payload !== null) {
      assert.match(payload.runId ?? '', /^grun_/, 'a filled slot needs a real CALL-E runId');
      assert.ok(payload.result, 'a filled slot needs a validated result object');
    }
  });

  test('the awaiting state explains itself rather than showing a sample', () => {
    assert.ok(PAGE.includes('WHY THIS IS EMPTY'));
    assert.ok(/will not show a sample checklist/.test(PAGE));
  });

  test('an unanswered field renders a dashed box, never a substitute', () => {
    assert.ok(PAGE.includes('class="crow unsaid"'));
    assert.ok(/value === null \|\| value === undefined/.test(PAGE));
  });

  test('unknown enum values map to null, not to a plausible word', () => {
    // PHRASING maps every `unknown` to null so `row()` renders the empty box.
    const phrasing = PAGE.match(/var PHRASING = \{[\s\S]*?\};/)[0];
    const unknowns = phrasing.match(/unknown:\s*([^,}\s]+)/g) ?? [];
    assert.equal(unknowns.length, 3);
    for (const u of unknowns) assert.match(u, /unknown:\s*null/);
  });
});

describe('landing page hygiene', () => {
  test('escapes interpolated result values', () => {
    // Everything that reaches innerHTML from the result object goes through esc().
    assert.ok(/function esc\(/.test(PAGE));
    assert.ok(/esc\(r\.clerk_quote\)/.test(PAGE));
    assert.ok(/esc\(d\.office/.test(PAGE));
  });

  test('has no image tags, so no link can break or fabricate', () => {
    assert.ok(!/<img\b/.test(RENDERED));
  });

  test('declares no og:image while the only one carries invented data', () => {
    assert.ok(!/<meta property="og:image"/.test(RENDERED));
  });

  test('carries the not-legally-binding line', () => {
    assert.ok(PAGE.includes('not legally binding'));
  });

  test('states the version honestly as a dev build', () => {
    assert.ok(PAGE.includes('v0.0.0-dev'));
  });
});
