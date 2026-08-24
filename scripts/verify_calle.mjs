#!/usr/bin/env node
/**
 * verify_calle.mjs — the first thing CounterCall ever did.
 *
 * Proves the CALL-E integration is real before any UI exists: authenticates with the
 * Developer API and calls `goals.list` against the live service, then reports exactly
 * what came back. No mocks, no fixtures, no network stubs.
 *
 * `goals.list` is a READ. It places no phone call and consumes no call credit, which is
 * why this is safe to run on every checkout and in CI.
 *
 *   CALLE_API_KEY=... node scripts/verify_calle.mjs
 *
 * Exit codes are meaningful, because this doubles as a preflight:
 *   0  authenticated, and at least one published Goal is reachable
 *   3  authenticated, but the Goal catalogue is EMPTY (nothing to run yet)
 *   4  authentication failed — bad or missing key
 *   5  transport failure — connection, timeout, or rate limit
 *   1  anything else
 */

import { CalleClient } from '@call-e/calle';

const EXIT = { OK: 0, EMPTY_CATALOGUE: 3, AUTH: 4, TRANSPORT: 5, UNKNOWN: 1 };

function line(label, value) {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

async function main() {
  const apiKey = process.env.CALLE_API_KEY;
  if (!apiKey) {
    console.error('CALLE_API_KEY is not set.');
    console.error('Export it, or source it from wherever you keep credentials.');
    console.error('It must never be committed to this repository.');
    return EXIT.AUTH;
  }

  const client = new CalleClient({ apiKey });

  console.log('CALL-E integration check');
  console.log('------------------------');
  line('SDK', '@call-e/calle');
  line('Method under test', 'client.goals.list()');
  line('Places a call?', 'no — this is a read, it costs nothing');
  console.log('');

  const startedAt = process.hrtime.bigint();
  const page = await client.goals.list();
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  const goals = page?.data ?? [];
  line('Authenticated', 'yes');
  line('Round trip', `${elapsedMs.toFixed(0)} ms`);
  line('Published Goals', String(goals.length));

  if (goals.length === 0) {
    console.log('');
    console.log('The catalogue is EMPTY. That is a real, expected state — not a failure.');
    console.log('Goals are authored and published in CALL-E Chat; publishing is deliberately');
    console.log('not a Developer API operation, and the API key scopes the owner. Draft,');
    console.log('hidden, paused and other owners\' Goals are never returned here.');
    console.log('');
    console.log('Until one Goal is published, goals.get and goals.run have nothing to target.');
    return EXIT.EMPTY_CATALOGUE;
  }

  console.log('');
  for (const goal of goals) {
    const id = goal.id ?? goal.goal_id ?? '(no id)';
    console.log(`  - ${id}  ${goal.title ?? ''}`);
  }
  console.log('');
  console.log('Pin the goal_id you intend to run into server-side config. Do not resolve it');
  console.log('by listing and taking data[0] — title is not stable identity.');
  return EXIT.OK;
}

/** Map SDK error classes onto distinct exit codes, so failures are diagnosable. */
function classify(error) {
  const name = error?.constructor?.name ?? 'Error';
  switch (name) {
    case 'CalleAuthenticationError':
      console.error('Authentication failed. The API key was rejected.');
      return EXIT.AUTH;
    case 'CalleRateLimitError':
      console.error('Rate limited. Back off and retry.');
      return EXIT.TRANSPORT;
    case 'CalleConnectionError':
      console.error('Could not reach the CALL-E API. Check connectivity.');
      return EXIT.TRANSPORT;
    case 'CalleTimeoutError':
      console.error('The request timed out before the API responded.');
      return EXIT.TRANSPORT;
    case 'CalleAPIError':
      console.error(`CALL-E returned an API error: ${error.message}`);
      if (error.detail_code) console.error(`detail_code: ${error.detail_code}`);
      return EXIT.UNKNOWN;
    default:
      console.error(`Unexpected ${name}: ${error?.message ?? error}`);
      return EXIT.UNKNOWN;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => process.exit(classify(error)));
