#!/usr/bin/env node
/**
 * call.mjs — places the call. DRY RUN BY DEFAULT.
 *
 * Without --live this prints the exact request it would send and exits. A skill that
 * dials by default is a skill that dials by accident.
 *
 *   node scripts/call.mjs --office imigrasi-jaksel --procedure "perpanjangan paspor"
 *   node scripts/call.mjs --office imigrasi-jaksel --procedure "perpanjangan paspor" --live
 */
import { readFileSync } from 'node:fs';
import { validateOffice, idempotencyKey, parseArgs } from './_lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.office || !args.procedure) {
  console.error('usage: call.mjs --office <id> --procedure "<name>" [--live]');
  process.exit(2);
}

const offices = JSON.parse(readFileSync(new URL('../data/offices.json', import.meta.url), 'utf8'));
const office = offices.find((o) => o.id === args.office);
const problems = validateOffice(office);
if (problems.length) {
  console.error(`REFUSING TO DIAL: ${problems.join('; ')}`);
  process.exit(3);
}

const today = new Date(Date.now()).toISOString().slice(0, 10);
const request = {
  goalId: process.env.COUNTERCALL_GOAL_ID ?? '<COUNTERCALL_GOAL_ID>',
  target: office.phone_e164,
  variables: {
    office_name: office.name,
    procedure: args.procedure,
    city: office.city,
  },
  idempotencyKey: idempotencyKey(args.office, args.procedure, today),
};

if (!args.live) {
  console.log('DRY RUN - no call placed. Add --live to dial.');
  console.log('');
  console.log(JSON.stringify(request, null, 2));
  console.log('');
  console.log(`This would ring ${office.phone_e164} (${office.name}).`);
  console.log(`Source: ${office.source_url}`);
  process.exit(0);
}

if (!process.env.CALLE_API_KEY) {
  console.error('--live requires CALLE_API_KEY.');
  process.exit(4);
}
if (!process.env.COUNTERCALL_GOAL_ID) {
  console.error('--live requires COUNTERCALL_GOAL_ID (publish a Goal in CALL-E Chat first).');
  process.exit(4);
}

const { CalleClient } = await import('@call-e/calle');
const client = new CalleClient({ apiKey: process.env.CALLE_API_KEY });

console.log(`Dialling ${office.phone_e164} ...`);
const started = Date.now();
try {
  const run = await client.goals.run(request.goalId, {
    target: request.target,
    variables: request.variables,
    idempotencyKey: request.idempotencyKey,
  });
  const outcome = await client.goals.waitForResult(request.goalId, run.id ?? run.runId);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (outcome.error) {
    // Error codes are control flow here, not a catch-all.
    const code = outcome.error.code ?? 'unknown';
    const said = {
      no_answer: 'The line did not answer. No checklist is available for this office today.',
      declined: 'The office declined to answer an automated caller.',
      result_invalid: 'The call completed but the answer did not match the contract. Nothing is shown.',
      timed_out: 'No usable answer was obtained.',
    }[code] ?? `Unrouted error code: ${code}`;
    console.log(`${code} after ${seconds}s`);
    console.log(said);
    console.log('No partial checklist is ever rendered.');
    process.exit(5);
  }

  console.log(`Result in ${seconds}s`);
  console.log(JSON.stringify(outcome.result, null, 2));
} catch (error) {
  console.error(`${error?.constructor?.name ?? 'Error'}: ${error?.message ?? error}`);
  process.exit(1);
}
