/**
 * The transport layer — two ways to reach CALL-E, one result shape.
 *
 * The interesting risk here is not "does it dial". It is that the two transports must
 * become INDISTINGUISHABLE by the time a result reaches `validateResult` and `renderCard`,
 * because everything above them was written against the Goals shape and is transport-blind.
 * A Calls result that arrives shaped even slightly differently would render a card that
 * looks sourced and is not.
 *
 * So most of this file drives `normaliseCall` against fixtures of what the Calls API
 * actually returns, per its published `CallTask` schema. No network, no key, no dialling.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectTransport, missingCredentials, normaliseCall, buildTask,
  goalsTransport, callsTransport,
} from '../skills/countercall/scripts/transport.mjs';
import { CONTRACT, contractFields, resultSchemaJSON, validateResult } from '../skills/countercall/scripts/contract.mjs';

const OFFICE = {
  id: 'fixture-office',
  name: 'Kantor Fixture',
  city: 'Jakarta Selatan',
  phone_e164: '+622112345678',
  source_url: 'https://x.invalid/kontak',
  source_checked: '2026-09-06',
};

/** A schema-valid result, the shape both transports must converge on. */
const GOOD_RESULT = {
  required_documents_text: 'KTP asli\nKartu Keluarga asli\npaspor lama',
  payment_method: 'cash',
  appointment_required: 'yes',
  originals_or_copies: 'originals',
  clerk_certainty: 'confident',
  clerk_quote: 'Bawa KTP asli dan kartu keluarga asli, ya.',
};

/** A terminal CallTask, per the published schema. */
function callTask(overrides = {}) {
  return {
    id: 'call_fixture',
    object: 'call_task',
    status: 'completed',
    task: 'irrelevant here',
    recipients: [],
    structuredResult: GOOD_RESULT,
    summary: null,
    taskCompleted: true,
    completionConfidence: { score: 0.9, label: 'high' },
    evidence: [],
    metadata: {},
    failureCode: null,
    failureMessage: null,
    createdAt: '2026-09-06T10:00:00Z',
    completedAt: '2026-09-06T10:01:00Z',
    ...overrides,
  };
}

describe('transport selection', () => {
  test('no Goal id selects calls', () => {
    assert.equal(selectTransport({}).name, 'calls');
  });

  test('a Goal id selects goals', () => {
    assert.equal(selectTransport({ COUNTERCALL_GOAL_ID: 'goal_x' }).name, 'goals');
  });

  test('an explicit transport overrides the Goal id in either direction', () => {
    assert.equal(selectTransport({ COUNTERCALL_GOAL_ID: 'goal_x', COUNTERCALL_TRANSPORT: 'calls' }).name, 'calls');
    assert.equal(selectTransport({ COUNTERCALL_TRANSPORT: 'goals' }).name, 'goals');
  });

  test('an unknown transport throws instead of silently defaulting', () => {
    // A typo that fell through to the default would dial on a path nobody chose.
    assert.throws(() => selectTransport({ COUNTERCALL_TRANSPORT: 'call' }), /must be "goals" or "calls"/);
  });

  test('each transport declares exactly the credentials it needs', () => {
    assert.deepEqual(missingCredentials(callsTransport, {}), ['CALLE_API_KEY']);
    assert.deepEqual(missingCredentials(callsTransport, { CALLE_API_KEY: 'k' }), []);
    assert.deepEqual(missingCredentials(goalsTransport, { CALLE_API_KEY: 'k' }), ['COUNTERCALL_GOAL_ID']);
  });
});

describe('the two transports return the same keys', () => {
  test('a normalised Calls outcome carries every key the Goals path returns', () => {
    const outcome = normaliseCall(callTask());
    assert.deepEqual(
      Object.keys(outcome).sort(),
      ['calledAt', 'completionConfidence', 'error', 'result', 'runId'],
    );
  });

  test('a successful call yields a result the pinned contract accepts', () => {
    const outcome = normaliseCall(callTask());
    assert.equal(outcome.error, null);
    assert.deepEqual(validateResult(outcome.result), []);
  });
});

describe('normaliseCall — a call that produced no usable answer', () => {
  test('completed with a null structuredResult is terminal, not an empty card', () => {
    // The docs are explicit: null means the evidence could not satisfy the schema. Handing
    // that upward as a null result would make renderCard decide what a missing checklist
    // means, and the only safe answer is to render nothing.
    const outcome = normaliseCall(callTask({ structuredResult: null }));
    assert.equal(outcome.result, null);
    assert.equal(outcome.error.code, 'result_unextractable');
  });

  test('a task-level failure code is preferred over the status', () => {
    const outcome = normaliseCall(callTask({ status: 'failed', structuredResult: null, failureCode: 'no_answer' }));
    assert.equal(outcome.error.code, 'no_answer');
  });

  test('a failure reported only on the dial attempt is still found', () => {
    // no_answer is reported per attempt, not per task, so reading only the task level
    // would report every unanswered call as a generic failure.
    const outcome = normaliseCall(callTask({
      status: 'failed',
      structuredResult: null,
      failureCode: null,
      recipients: [{ attempts: [{ failureCode: 'NO_ANSWER' }] }],
    }));
    assert.equal(outcome.error.code, 'no_answer');
  });

  test('vendor spellings fold onto the codes the renderer knows', () => {
    const cases = [
      ['user_declined', 'declined'],
      ['REJECTED', 'declined'],
      ['line_busy', 'declined'],
      ['dial_timeout', 'no_answer'],
      ['unanswered', 'no_answer'],
    ];
    for (const [vendor, expected] of cases) {
      const outcome = normaliseCall(callTask({ status: 'failed', structuredResult: null, failureCode: vendor }));
      assert.equal(outcome.error.code, expected, `${vendor} should fold to ${expected}`);
    }
  });

  test('a cancelled call is not reported as a failed one', () => {
    const outcome = normaliseCall(callTask({ status: 'canceled', structuredResult: null }));
    assert.equal(outcome.error.code, 'canceled');
  });

  test('a failure with no code anywhere still returns a terminal code, never undefined', () => {
    const outcome = normaliseCall(callTask({ status: 'failed', structuredResult: null, recipients: [] }));
    assert.equal(outcome.error.code, 'call_failed');
  });

  test('a result that arrives on a failed call is still refused', () => {
    // Trust the status over the payload. A structured result on a failed call is a
    // contradiction, and the safe reading is that the call did not happen.
    const outcome = normaliseCall(callTask({ status: 'failed' }));
    assert.equal(outcome.result, null);
    assert.ok(outcome.error);
  });
});

describe('normaliseCall — identity and provenance', () => {
  test('the runId is the id from create, not from the terminal poll', () => {
    const created = { id: 'call_created', createdAt: '2026-09-06T09:59:00Z' };
    const outcome = normaliseCall(callTask({ id: 'call_something_else' }), created);
    assert.equal(outcome.runId, 'call_created');
    assert.equal(outcome.calledAt, '2026-09-06T09:59:00Z');
  });

  test('snake_case wire fields are read as well as the SDK camelCase', () => {
    const wire = { status: 'completed', structured_result: GOOD_RESULT, id: 'call_wire', createdAt: 'x' };
    const outcome = normaliseCall(wire);
    assert.deepEqual(outcome.result, GOOD_RESULT);
  });

  test('completionConfidence is carried but is not part of the card contract', () => {
    const outcome = normaliseCall(callTask());
    assert.deepEqual(outcome.completionConfidence, { score: 0.9, label: 'high' });
    // It must never leak into the validated result — the card's certainty is what the clerk
    // conveyed, not what a model concluded after the fact.
    assert.ok(!('completionConfidence' in outcome.result));
    assert.deepEqual(validateResult(outcome.result), []);
  });
});

describe('the request-scoped schema', () => {
  test('it covers every pinned field and requires exactly the required ones', () => {
    const schema = resultSchemaJSON();
    assert.deepEqual(Object.keys(schema.properties).sort(), contractFields().sort());
    assert.deepEqual(schema.required.sort(), [...CONTRACT.required].sort());
    assert.equal(schema.additionalProperties, false);
  });

  test('the optional fee is emitted but never required', () => {
    const schema = resultSchemaJSON();
    assert.equal(schema.properties.total_fee_idr.type, 'number');
    assert.ok(!schema.required.includes('total_fee_idr'));
  });

  test('every enum in the contract reaches the schema', () => {
    const schema = resultSchemaJSON();
    for (const [field, values] of Object.entries(CONTRACT.enums)) {
      assert.deepEqual(schema.properties[field].enum, values, `${field} enum did not survive`);
    }
  });

  test('it uses no schema feature the Calls API lists as unsupported', () => {
    // $ref, oneOf, anyOf, allOf and format are documented as unsupported; sending one
    // would be rejected at request time, on a path only a live call exercises.
    const json = JSON.stringify(resultSchemaJSON());
    for (const banned of ['$ref', 'oneOf', 'anyOf', 'allOf', '"format"']) {
      assert.ok(!json.includes(banned), `schema must not use ${banned}`);
    }
  });

  test('a mutation of the returned schema cannot poison the next call', () => {
    const first = resultSchemaJSON();
    first.required.push('injected');
    first.properties.payment_method.enum.push('crypto');
    const second = resultSchemaJSON();
    assert.ok(!second.required.includes('injected'));
    assert.ok(!second.properties.payment_method.enum.includes('crypto'));
  });
});

describe('the task text sent on the calls transport', () => {
  const raw = buildTask(OFFICE, 'perpanjangan paspor');
  // The task is hard-wrapped for readability, so every assertion below matches against a
  // whitespace-collapsed copy. Pinning to the current line breaks would make a future
  // rewrap look like a behaviour change.
  const task = raw.replace(/\s+/g, ' ');

  test('it names the number, the office and the procedure', () => {
    assert.ok(task.includes(OFFICE.phone_e164));
    assert.ok(task.includes(OFFICE.name));
    assert.ok(task.includes('perpanjangan paspor'));
  });

  test('it instructs the agent to identify itself as automated', () => {
    assert.ok(/automated assistant/i.test(task));
  });

  test('it treats a refusal as an answer rather than something to work around', () => {
    assert.ok(/do not press/i.test(task));
    assert.ok(/refusal is a valid outcome/i.test(task));
  });

  test('it forbids collecting personal data', () => {
    assert.ok(/do not ask for/i.test(task));
    assert.ok(/personal data/i.test(task));
  });

  test('it asks for every field the contract requires an answer to', () => {
    // If a question is dropped from the script, the schema still demands the field and the
    // model has to invent it. The two must stay in step.
    for (const fragment of ['documents', 'originals', 'fee', 'cash or by card', 'appointment']) {
      assert.ok(task.toLowerCase().includes(fragment.toLowerCase()), `task must ask about ${fragment}`);
    }
  });
});

describe('describe() builds the request without placing it', () => {
  test('the calls request carries recipients, schema and metadata, and no phone field', () => {
    const request = callsTransport.describe(OFFICE, 'paspor baru', 'key-1');
    assert.deepEqual(request.recipients, [{ phones: [OFFICE.phone_e164] }]);
    assert.equal(request.idempotencyKey, 'key-1');
    assert.equal(request.resultSchema.additionalProperties, false);
    assert.ok(!('phone' in request));
  });

  test('the goals request carries phone and variables, and no schema', () => {
    const request = goalsTransport.describe(OFFICE, 'paspor baru', 'key-1', { COUNTERCALL_GOAL_ID: 'goal_x' });
    assert.equal(request.phone, OFFICE.phone_e164);
    assert.equal(request.goalId, 'goal_x');
    // The published Goal owns the schema on this path; sending one would be rejected.
    assert.ok(!('resultSchema' in request));
  });

  test('neither describe() touches the network or needs a client', () => {
    assert.doesNotThrow(() => callsTransport.describe(OFFICE, 'p', 'k'));
    assert.doesNotThrow(() => goalsTransport.describe(OFFICE, 'p', 'k', {}));
  });
});
