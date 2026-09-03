import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { percentile, summarize, toMarkdown, UNANSWERED } from '../scripts/bench_stats.mjs';

const ok = (office, ms) => ({ office, procedure: 'p', outcome: 'result', validated: true, ms, runId: `grun_${ms}` });
const bad = (office, outcome) => ({ office, procedure: 'p', outcome, validated: false, ms: 1000, runId: 'grun_x' });

describe('percentile', () => {
  test('p50 of a ten-value set is the nearest rank', () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
  });

  test('p95 of a twenty-value set', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.equal(percentile(values, 0.95), 19);
  });

  test('does not care about input order', () => {
    assert.equal(percentile([9, 1, 5, 3, 7], 0.5), 5);
  });

  test('p0 is the minimum', () => {
    assert.equal(percentile([4, 1, 9], 0), 1);
  });

  test('p100 is the maximum', () => {
    assert.equal(percentile([4, 1, 9], 1), 9);
  });

  test('a single value is its own percentile', () => {
    assert.equal(percentile([42], 0.95), 42);
  });

  test('an empty set is null, never zero — a p95 of 0 ms is a lie', () => {
    assert.equal(percentile([], 0.5), null);
  });

  test('non-finite values are dropped rather than poisoning the sort', () => {
    assert.equal(percentile([1, NaN, 3, undefined, 5], 0.5), 3);
  });

  test('sorts numerically, not lexicographically', () => {
    // The classic bug: [10, 9, 100].sort() is [10, 100, 9].
    assert.equal(percentile([10, 9, 100], 0.5), 10);
  });
});

describe('summarize counts honestly', () => {
  const records = [
    ok('a', 30000), ok('a', 40000), ok('b', 50000),
    bad('b', 'no_answer'), bad('c', 'declined'), bad('c', 'result_invalid'),
  ];

  test('counts every attempt', () => {
    assert.equal(summarize(records).attempts, 6);
  });

  test('a no_answer does not count as answered', () => {
    assert.equal(summarize(records).answered, 5);
  });

  test('a declined call counts as answered — someone picked up', () => {
    assert.ok(!UNANSWERED.has('declined'));
  });

  test('only validated results count as usable', () => {
    assert.equal(summarize(records).usable, 3);
  });

  test('a result that failed validation is not usable', () => {
    const summary = summarize([ok('a', 1000), { ...ok('a', 2000), validated: false }]);
    assert.equal(summary.usable, 1);
  });

  test('rates are computed over attempts, not over successes', () => {
    assert.equal(summarize(records).usableRate, 3 / 6);
  });

  test('breaks down every outcome, failures included', () => {
    const { outcomes } = summarize(records);
    assert.equal(outcomes.result, 3);
    assert.equal(outcomes.no_answer, 1);
    assert.equal(outcomes.declined, 1);
    assert.equal(outcomes.result_invalid, 1);
  });

  test('latency is measured over usable calls only', () => {
    assert.equal(summarize(records).latency.n, 3);
  });

  test('a failed call does not drag the latency figures', () => {
    assert.equal(summarize(records).latency.p50, 40000);
  });

  test('reports min and max alongside the percentiles', () => {
    const { latency } = summarize(records);
    assert.equal(latency.min, 30000);
    assert.equal(latency.max, 50000);
  });

  test('groups by office', () => {
    const { offices } = summarize(records);
    assert.equal(offices.length, 3);
    assert.deepEqual(offices[0], { office: 'a', attempts: 2, usable: 2 });
  });

  test('collects run ids so every number is traceable to a call', () => {
    assert.equal(summarize(records).runIds.length, 6);
  });

  test('an empty record set yields zeroes and null rates, not fabricated numbers', () => {
    const summary = summarize([]);
    assert.equal(summary.attempts, 0);
    assert.equal(summary.answeredRate, null);
    assert.equal(summary.latency.p50, null);
  });

  test('is deterministic — the same records always summarize identically', () => {
    assert.deepEqual(summarize(records), summarize(records));
  });
});

describe('toMarkdown', () => {
  const summary = summarize([ok('a', 30000), ok('a', 40000), bad('b', 'no_answer')]);
  const markdown = toMarkdown(summary, { measuredAt: '2026-09-03' });

  test('refuses to render a table from zero calls', () => {
    assert.throws(() => toMarkdown(summarize([])), /refusing to render/);
  });

  test('states the number of real calls', () => {
    assert.ok(markdown.includes('| Real calls placed | 3 |'));
  });

  test('reports the p50 in seconds', () => {
    // Nearest rank over two usable calls (30s, 40s) is the lower one.
    assert.ok(markdown.includes('| p50 dial → validated checklist | 30.0s |'));
  });

  test('reports the answered rate as a percentage', () => {
    assert.ok(markdown.includes('67%'));
  });

  test('publishes the failure breakdown, not just the successes', () => {
    assert.ok(markdown.includes('`no_answer`'));
  });

  test('says explicitly which calls the latency covers', () => {
    assert.ok(markdown.includes('2 calls that produced a'));
  });

  test('carries the measurement date', () => {
    assert.ok(markdown.includes('2026-09-03'));
  });

  test('is deterministic', () => {
    assert.equal(toMarkdown(summary, { measuredAt: '2026-09-03' }), markdown);
  });
});
