/**
 * bench_stats.mjs — the arithmetic behind the benchmark, with no I/O.
 *
 * Split out from bench.mjs so the numbers that reach a judged surface are themselves
 * under test. Every function here is pure.
 *
 * One rule runs through the whole file: a number is only ever computed from records that
 * exist. There is no default, no estimate, and no "typical" value. If there are no
 * records, the summary says so and the report refuses to render a table.
 */

/** Outcomes where the phone was never picked up. Excluded from the answered count. */
export const UNANSWERED = new Set(['no_answer', 'call_failed', 'canceled']);

/**
 * Nearest-rank percentile over an unsorted array of numbers.
 * Returns null for an empty input rather than 0 — a p95 of "0 ms" is a lie.
 */
export function percentile(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1];
}

/**
 * Reduce raw call records to the numbers the README and DEMO.md quote.
 *
 * A record is `{office, procedure, outcome, ms, runId, validated}` where `outcome` is
 * either `result` or a GoalRunError code.
 */
export function summarize(records) {
  const attempts = records.length;
  const answered = records.filter((r) => !UNANSWERED.has(r.outcome));
  const usable = records.filter((r) => r.outcome === 'result' && r.validated === true);

  const outcomes = {};
  for (const record of records) {
    outcomes[record.outcome] = (outcomes[record.outcome] ?? 0) + 1;
  }

  const latencies = usable.map((r) => r.ms);

  const byOffice = new Map();
  for (const record of records) {
    const row = byOffice.get(record.office) ?? { office: record.office, attempts: 0, usable: 0 };
    row.attempts += 1;
    if (record.outcome === 'result' && record.validated === true) row.usable += 1;
    byOffice.set(record.office, row);
  }

  return {
    attempts,
    answered: answered.length,
    answeredRate: attempts ? answered.length / attempts : null,
    usable: usable.length,
    usableRate: attempts ? usable.length / attempts : null,
    outcomes,
    latency: {
      n: latencies.length,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      min: latencies.length ? Math.min(...latencies) : null,
      max: latencies.length ? Math.max(...latencies) : null,
    },
    offices: [...byOffice.values()].sort((a, b) => a.office.localeCompare(b.office)),
    runIds: records.map((r) => r.runId).filter(Boolean),
  };
}

const pct = (value) => (value === null ? '—' : `${(value * 100).toFixed(0)}%`);
const ms = (value) => (value === null ? '—' : `${(value / 1000).toFixed(1)}s`);

/**
 * Render the summary as the Markdown block that goes into DEMO.md.
 * Throws on an empty record set: an empty benchmark table reads as a measurement, and it
 * is not one.
 */
export function toMarkdown(summary, meta = {}) {
  if (summary.attempts === 0) {
    throw new Error(
      'refusing to render a benchmark table from zero calls — run the bench live first',
    );
  }

  const lines = [];
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Real calls placed | ${summary.attempts} |`);
  lines.push(`| Line answered | ${summary.answered} (${pct(summary.answeredRate)}) |`);
  lines.push(`| Usable validated checklist | ${summary.usable} (${pct(summary.usableRate)}) |`);
  lines.push(`| p50 dial → validated checklist | ${ms(summary.latency.p50)} |`);
  lines.push(`| p95 dial → validated checklist | ${ms(summary.latency.p95)} |`);
  lines.push(`| Fastest / slowest | ${ms(summary.latency.min)} / ${ms(summary.latency.max)} |`);
  if (meta.measuredAt) lines.push(`| Measured | ${meta.measuredAt} |`);
  lines.push('');
  lines.push(`Latency is measured over the ${summary.latency.n} calls that produced a`);
  lines.push('validated checklist. Calls that were never answered are excluded from the');
  lines.push('latency figures and included in every count above.');
  lines.push('');
  lines.push('**Every outcome, including the failures:**');
  lines.push('');
  lines.push('| Outcome | Calls |');
  lines.push('|---|---|');
  for (const [outcome, count] of Object.entries(summary.outcomes).sort()) {
    lines.push(`| \`${outcome}\` | ${count} |`);
  }

  if (summary.offices.length > 1) {
    lines.push('');
    lines.push('| Office | Calls | Usable |');
    lines.push('|---|---|---|');
    for (const row of summary.offices) {
      lines.push(`| ${row.office} | ${row.attempts} | ${row.usable} |`);
    }
  }

  return lines.join('\n');
}
