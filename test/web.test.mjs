/**
 * The landing page is a judged surface, so it gets the same rule as the product:
 * it may not display a value nobody said.
 *
 * `assets/ASSETS.md` blocks the invented `Rp 650.000` / `3m41s` call from the gallery, the
 * README and the video. This suite extends that mechanically to the pages GitHub Pages
 * serves from `web/` — the first thing a judge sees.
 *
 * These are string assertions over the shipped file rather than DOM tests — the page has no
 * build step and no dependencies, so the file on disk is exactly what ships.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const PAGE = read('../web/index.html');
const DECK = read('../web/pitch/index.html');
const NOTFOUND = read('../web/404.html');
const VERSION = JSON.parse(read('../package.json')).version;

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
    assert.ok(PAGE.includes('class="crow empty done"'));
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

  test('every image is a local file that exists', () => {
    // Was "no image tags at all", which was true only while the page had no brand
    // assets and no social card. Both now exist and are checked instead of banned.
    const srcs = [...RENDERED.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(srcs.length > 0, 'the page should carry its brand mark');
    for (const src of srcs) {
      assert.ok(!/^https?:/.test(src), `remote image: ${src}`);
      assert.ok(existsSync(fileURLToPath(new URL('../web/' + src, import.meta.url))), src);
    }
  });

  test('declares an og:image, and it is the clean one', () => {
    // The old assertion banned og:image entirely, because the only one available
    // rendered the fabricated Rp 650.000. assets/generate-og-web.html now produces
    // one with no call data at all, so the card is declared rather than omitted.
    assert.match(RENDERED, /<meta property="og:image" content="[^"]+og-image\.png"/);
    assert.ok(existsSync(fileURLToPath(new URL('../web/og-image.png', import.meta.url))));
  });

  test('carries the not-legally-binding line', () => {
    assert.ok(PAGE.includes('not legally binding'));
  });

  /**
   * Was `assert.ok(PAGE.includes('v0.0.0-dev'))`. That pinned the page to a literal that
   * stopped being honest the moment v1.0.0 was tagged — the assertion would have kept
   * passing on a stale string and failed on a corrected one, which is backwards. The
   * property is "the page states the version this tree actually is", so read it from
   * package.json and let the two drift apart nowhere.
   */
  test('states the version this tree actually is', () => {
    assert.ok(PAGE.includes(`v${VERSION}`), `landing page does not state v${VERSION}`);
  });

  /**
   * The check above covered the landing page only, so 404.html kept saying v0.0.0-dev after
   * v1.0.0 was tagged — and nothing caught it, because the frame that would have shown it in
   * the gallery was rendering blank. A per-page assertion is worth little; the property is
   * that NO published page states a version other than the real one.
   */
  test('no published page states a stale version', () => {
    for (const [name, html] of [['landing', PAGE], ['404', NOTFOUND], ['deck', DECK]]) {
      const stated = [...html.matchAll(/v(\d+\.\d+\.\d+(?:-[\w.]+)?)/g)].map((m) => m[1]);
      for (const v of stated) {
        assert.equal(v, VERSION, `${name} states v${v}, but package.json says v${VERSION}`);
      }
    }
  });
});

describe('every published page is free of fabricated call data', () => {
  const strip = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ')
                        .replace(/toLocaleString\([^)]*\)/g, ' ');

  for (const [name, html] of [['landing', PAGE], ['deck', DECK], ['404', NOTFOUND]]) {
    test(`${name} renders no rupiah figure`, () => {
      assert.ok(!/Rp ?\d/.test(strip(html)), `${name} renders a fabricated fee`);
    });
    test(`${name} renders no call duration`, () => {
      assert.ok(!/\d+m\d+s/.test(strip(html)), `${name} renders a fabricated duration`);
    });
  }

  test('the deck labels its illustrative values in frame', () => {
    // Slide 7 shows values from references/examples.md, which states they are not
    // recordings. It may show them only while it says so.
    if (/Kartu Keluarga asli/.test(DECK)) {
      assert.match(DECK, /not a call recording/i);
    }
  });

  test('the deck still has exactly ten slides', () => {
    assert.equal((DECK.match(/<section\b(?=[^>]*class="slide)/g) || []).length, 10);
  });

  test('no deck slide lost its speaker notes', () => {
    const notes = DECK.match(/data-notes="[^"]{80,}"/g) || [];
    assert.equal(notes.length, 10);
  });

  test('404 uses root-absolute asset paths, which is what Pages needs', () => {
    // A relative path here resolves against the missing URL's directory and breaks.
    // Served from a custom-domain root, so no project-path prefix.
    assert.match(NOTFOUND, /href="\/icon\.svg"/);
    assert.ok(!/\/countercall\//.test(NOTFOUND), 'stale project-path prefix');
  });

  test('a CNAME ships with the site, or the custom domain is dropped on deploy', () => {
    const cname = read('../web/CNAME').trim();
    assert.match(cname, /^[a-z0-9.-]+\.[a-z]{2,}$/);
  });
});
