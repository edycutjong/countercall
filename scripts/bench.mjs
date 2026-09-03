#!/usr/bin/env node
/**
 * bench.mjs — measure what CounterCall actually does on real phone lines.
 *
 * Three modes:
 *
 *   node scripts/bench.mjs --plan --calls 20
 *       Print the call plan and stop. Places nothing, spends nothing.
 *
 *   node scripts/bench.mjs --live --calls 20
 *       Place real Goal Runs, one per office/procedure pair, honouring the one-call-per-
 *       office-per-procedure-per-day rule. Appends every record to bench/records.json.
 *
 *   node scripts/bench.mjs --report
 *       Recompute the summary from bench/records.json and print the DEMO.md block.
 *       Deterministic: same records in, same bytes out.
 *
 * The report refuses to render from zero records. There is no seeded, simulated or
 * example mode, because a benchmark table that can be produced without calling anyone is
 * a benchmark table that will eventually be produced without calling anyone.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';

import { parseArgs, validateOffice, idempotencyKey, loadOffices } from '../skills/countercall/scripts/_lib.mjs';
import { validateResult } from '../skills/countercall/scripts/contract.mjs';
import { summarize, toMarkdown } from './bench_stats.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RECORDS = `${ROOT}bench/records.json`;
// The seed file lives with the skill, not beside this script.
const SEED_BASE = new URL('../skills/countercall/scripts/', import.meta.url).href;

const args = parseArgs(process.argv.slice(2));
const budget = Number(args.calls ?? 20);

function loadRecords() {
  if (!existsSync(RECORDS)) return [];
  return JSON.parse(readFileSync(RECORDS, 'utf8'));
}

function saveRecords(records) {
  mkdirSync(`${ROOT}bench`, { recursive: true });
  writeFileSync(RECORDS, `${JSON.stringify(records, null, 2)}\n`);
}

/** One entry per office/procedure pair, capped at the budget. */
function plan(offices) {
  const pairs = [];
  for (const office of offices) {
    for (const procedure of office.procedures ?? []) {
      pairs.push({ office, procedure });
    }
  }
  return pairs.slice(0, budget);
}

// ---------------------------------------------------------------- report

if (args.report) {
  const records = loadRecords();
  const summary = summarize(records);
  if (summary.attempts === 0) {
    // Repo-relative, not absolute: an author's machine path in a user-facing error
    // is noise to every user, and it leaks the directory structure around the repo.
    console.error(`No call records in ${relative(process.cwd(), RECORDS)}.`);
    console.error('Run `node scripts/bench.mjs --live --calls 20` first.');
    console.error('This script will not invent numbers.');
    process.exit(3);
  }
  console.log(toMarkdown(summary, { measuredAt: records.at(-1)?.at?.slice(0, 10) }));
  process.exit(0);
}

// ---------------------------------------------------------------- plan

const offices = loadOffices(args, SEED_BASE);
const pairs = plan(offices);

if (pairs.length < budget) {
  console.error(`WARNING: the seed file yields ${pairs.length} office/procedure pairs, `
    + `short of the requested ${budget}. The bench will place ${pairs.length} calls.`);
}

if (!args.live) {
  console.log('BENCH PLAN — no calls placed. Add --live to dial.');
  console.log('');
  for (const { office, procedure } of pairs) {
    const problems = validateOffice(office);
    const state = problems.length ? `BLOCKED — ${problems.join('; ')}` : 'ready';
    console.log(`  ${office.id.padEnd(24)} ${procedure.padEnd(28)} ${state}`);
  }
  console.log('');
  console.log(`${pairs.length} calls planned. Ready: `
    + `${pairs.filter(({ office }) => validateOffice(office).length === 0).length}.`);
  process.exit(0);
}

// ---------------------------------------------------------------- live

if (!process.env.CALLE_API_KEY || !process.env.COUNTERCALL_GOAL_ID) {
  console.error('--live requires CALLE_API_KEY and COUNTERCALL_GOAL_ID.');
  process.exit(4);
}

const { CalleClient } = await import('@call-e/calle');
const client = new CalleClient({ apiKey: process.env.CALLE_API_KEY });
const goalId = process.env.COUNTERCALL_GOAL_ID;
const records = loadRecords();
const today = new Date(Date.now()).toISOString().slice(0, 10);

for (const { office, procedure } of pairs) {
  const problems = validateOffice(office);
  if (problems.length) {
    console.log(`SKIP ${office.id} / ${procedure} — ${problems.join('; ')}`);
    continue;
  }

  const key = idempotencyKey(office.id, procedure, today);
  if (records.some((r) => r.idempotencyKey === key)) {
    console.log(`SKIP ${office.id} / ${procedure} — already called today`);
    continue;
  }

  const started = Date.now();
  let record;
  try {
    const run = await client.goals.run({
      goalId,
      phone: office.phone_e164,
      variables: { office_name: office.name, procedure, city: office.city },
      idempotencyKey: key,
    });
    const outcome = await client.goals.waitForResult(goalId, run.id);
    const elapsed = Date.now() - started;

    if (outcome.error) {
      record = { outcome: outcome.error.code, validated: false, runId: run.id, ms: elapsed };
    } else {
      const invalid = validateResult(outcome.result);
      record = invalid.length
        ? { outcome: 'result_invalid', validated: false, runId: run.id, ms: elapsed, problems: invalid }
        : { outcome: 'result', validated: true, runId: run.id, ms: elapsed };
    }
  } catch (error) {
    record = {
      outcome: 'call_failed',
      validated: false,
      runId: null,
      ms: Date.now() - started,
      problems: [`${error?.constructor?.name}: ${error?.message}`],
    };
  }

  record = {
    ...record,
    office: office.id,
    procedure,
    idempotencyKey: key,
    at: new Date(Date.now()).toISOString(),
  };
  records.push(record);
  saveRecords(records);

  console.log(
    `${record.outcome.padEnd(20)} ${(record.ms / 1000).toFixed(1)}s  `
    + `${office.id} / ${procedure}  ${record.runId ?? ''}`,
  );
}

console.log('');
console.log(toMarkdown(summarize(records), { measuredAt: today }));
