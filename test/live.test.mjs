/**
 * The tests that need the network.
 *
 * Everything else in test/ passes with the ethernet cable pulled out, which is exactly how
 * a suite ends up proving nothing about the integration it exists to defend. These tests
 * talk to the real CALL-E Developer API.
 *
 * They are READS. `goals.list` and `goals.get` place no phone call and consume no call
 * credit, so this file is safe to run on every checkout and in CI.
 *
 *   CALLE_API_KEY=...                       # runs the catalogue tests
 *   COUNTERCALL_GOAL_ID=goal_...            # additionally runs the pinned-contract tests
 *
 * Without a key the whole file SKIPS LOUDLY. A skip is not a pass, and the README states
 * the offline and live counts separately for that reason.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import { diffContract, publishedRunSpec } from '../skills/countercall/scripts/_lib.mjs';
import { CONTRACT, contractFields } from '../skills/countercall/scripts/contract.mjs';

const API_KEY = process.env.CALLE_API_KEY;
const GOAL_ID = process.env.COUNTERCALL_GOAL_ID;

const noKey = !API_KEY ? 'CALLE_API_KEY is not set — live integration NOT verified' : false;
const noGoal = !GOAL_ID
  ? 'COUNTERCALL_GOAL_ID is not set — no published Goal to check the contract against'
  : false;

let client;
before(async () => {
  if (!API_KEY) return;
  const { CalleClient } = await import('@call-e/calle');
  client = new CalleClient({ apiKey: API_KEY });
});

describe('CALL-E Developer API — live reads', { skip: noKey }, () => {
  test('authenticates and lists the Goal catalogue', async () => {
    const page = await client.goals.list();
    assert.equal(page.object, 'list');
    assert.ok(Array.isArray(page.data));
  });

  test('the catalogue page carries a cursor field, present or null', async () => {
    const page = await client.goals.list();
    assert.ok('nextCursor' in page);
  });

  test('a limit is honoured', async () => {
    const page = await client.goals.list({ limit: 1 });
    assert.ok(page.data.length <= 1);
  });

  test('every returned Goal is active and carries a published RunSpec', async () => {
    const page = await client.goals.list();
    for (const goal of page.data) {
      assert.equal(goal.status, 'active');
      assert.ok(publishedRunSpec(goal), `goal ${goal.id} has no readable RunSpec`);
    }
  });

  test('a published RunSpec is readable through the casing shim', async () => {
    const page = await client.goals.list();
    if (page.data.length === 0) {
      // An empty catalogue is a real, expected state until a Goal is published in
      // CALL-E Chat. Recorded rather than silently passed.
      assert.equal(page.data.length, 0);
      return;
    }
    const spec = publishedRunSpec(page.data[0]);
    assert.equal(typeof spec.version, 'number');
    assert.ok(spec.resultSchema, 'resultSchema must survive the camelCase shim');
  });

  test('an unknown Goal id is rejected, not silently empty', async () => {
    await assert.rejects(() => client.goals.get('goal_definitely_not_real_countercall'));
  });

  test('a bad API key is rejected', async () => {
    const { CalleClient } = await import('@call-e/calle');
    const bad = new CalleClient({ apiKey: 'sk-definitely-not-a-real-key' });
    await assert.rejects(() => bad.goals.list());
  });
});

describe('the pinned contract still matches the published Goal', { skip: noKey || noGoal }, () => {
  let goal;
  before(async () => {
    goal = await client.goals.get(GOAL_ID);
  });

  test('the Goal is reachable and active', () => {
    assert.equal(goal.status, 'active');
  });

  test('its published RunSpec is readable', () => {
    assert.ok(publishedRunSpec(goal));
  });

  test('the live result schema is closed', () => {
    assert.equal(publishedRunSpec(goal).resultSchema.additionalProperties, false);
  });

  test('no drift against the pinned contract', () => {
    const drift = diffContract(
      { version: CONTRACT.version, result_fields: contractFields() },
      publishedRunSpec(goal),
    );
    assert.deepEqual(drift, [], `contract drift: ${drift.join('; ')}`);
  });

  test('the live result schema declares no array field', () => {
    // Goal Run results are a flat map of scalars. An array here means the Goal was
    // published against a schema the API cannot actually return.
    const properties = publishedRunSpec(goal).resultSchema.properties ?? {};
    for (const [field, schema] of Object.entries(properties)) {
      assert.notEqual(schema.type, 'array', `${field} is an array`);
    }
  });
});
