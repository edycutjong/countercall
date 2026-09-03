import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  E164,
  validateOffice,
  diffContract,
  idempotencyKey,
  parseArgs,
  publishedRunSpec,
} from '../skills/countercall/scripts/_lib.mjs';

const GOOD_OFFICE = {
  id: 'imigrasi-jaksel',
  name: 'Kantor Imigrasi Jakarta Selatan',
  city: 'Jakarta Selatan',
  phone_e164: '+622112345678',
  source_url: 'https://jakartaselatan.imigrasi.go.id/',
  source_checked: '2026-09-03',
  procedures: ['perpanjangan paspor'],
};

describe('E164', () => {
  test('accepts a plausible Indonesian landline', () => {
    assert.ok(E164.test('+622112345678'));
  });

  test('accepts a plausible Indonesian mobile', () => {
    assert.ok(E164.test('+6281234567890'));
  });

  test('rejects a local-format number — this is how a stranger’s phone rings', () => {
    assert.ok(!E164.test('0211234567'));
  });

  test('rejects a number with spaces', () => {
    assert.ok(!E164.test('+62 21 1234 5678'));
  });

  test('rejects a number with punctuation', () => {
    assert.ok(!E164.test('+62-21-1234-5678'));
  });

  test('rejects a leading zero after the plus', () => {
    assert.ok(!E164.test('+0211234567'));
  });

  test('rejects a number that is too short', () => {
    assert.ok(!E164.test('+621234'));
  });

  test('rejects a number longer than 15 digits', () => {
    assert.ok(!E164.test('+6211111111111111'));
  });

  test('rejects an extension suffix', () => {
    assert.ok(!E164.test('+622112345678x21'));
  });
});

describe('validateOffice', () => {
  test('a fully sourced office has no problems', () => {
    assert.deepEqual(validateOffice(GOOD_OFFICE), []);
  });

  test('a missing office is reported rather than thrown', () => {
    assert.deepEqual(validateOffice(undefined), ['office not found in the seed file']);
  });

  test('a null office is reported rather than thrown', () => {
    assert.deepEqual(validateOffice(null), ['office not found in the seed file']);
  });

  test('no phone number at all', () => {
    const problems = validateOffice({ ...GOOD_OFFICE, phone_e164: undefined });
    assert.ok(problems.includes('no phone_e164'));
  });

  test('a non-E.164 number is refused', () => {
    const problems = validateOffice({ ...GOOD_OFFICE, phone_e164: '0211234567' });
    assert.ok(problems.some((p) => p.startsWith('not E.164')));
  });

  test('a number with no published source is refused', () => {
    const problems = validateOffice({ ...GOOD_OFFICE, source_url: undefined });
    assert.ok(problems.includes('no source_url — a number needs a published source'));
  });

  test('a number nobody has checked is refused', () => {
    const problems = validateOffice({ ...GOOD_OFFICE, source_checked: null });
    assert.ok(problems.includes('no source_checked date'));
  });

  test('the shipped placeholder number is caught explicitly', () => {
    const problems = validateOffice({ ...GOOD_OFFICE, phone_e164: '+62XXXXXXXXXX' });
    assert.ok(problems.includes('placeholder number'));
  });

  test('a placeholder accumulates both the format and the placeholder problem', () => {
    const problems = validateOffice({ ...GOOD_OFFICE, phone_e164: '+62XXXXXXXXXX' });
    assert.ok(problems.length >= 2);
  });

  test('problems accumulate rather than short-circuiting on the first', () => {
    const problems = validateOffice({ id: 'x' });
    assert.ok(problems.length >= 3);
  });
});

describe('idempotencyKey', () => {
  test('is stable for the same office, procedure and day', () => {
    const a = idempotencyKey('imigrasi-jaksel', 'perpanjangan paspor', '2026-09-03');
    const b = idempotencyKey('imigrasi-jaksel', 'perpanjangan paspor', '2026-09-03');
    assert.equal(a, b);
  });

  test('has the documented shape', () => {
    assert.equal(
      idempotencyKey('imigrasi-jaksel', 'perpanjangan paspor', '2026-09-03'),
      'countercall:imigrasi-jaksel:perpanjangan-paspor:2026-09-03:v1',
    );
  });

  test('changes on a different day, so tomorrow may call again', () => {
    const today = idempotencyKey('a', 'b', '2026-09-03');
    const tomorrow = idempotencyKey('a', 'b', '2026-09-04');
    assert.notEqual(today, tomorrow);
  });

  test('changes for a different procedure at the same office', () => {
    assert.notEqual(
      idempotencyKey('imigrasi-jaksel', 'paspor baru', '2026-09-03'),
      idempotencyKey('imigrasi-jaksel', 'perpanjangan paspor', '2026-09-03'),
    );
  });

  test('changes for the same procedure at a different office', () => {
    assert.notEqual(
      idempotencyKey('imigrasi-jakbar', 'paspor baru', '2026-09-03'),
      idempotencyKey('imigrasi-jaksel', 'paspor baru', '2026-09-03'),
    );
  });

  test('is case-insensitive — capitalisation must not mint a second call', () => {
    assert.equal(
      idempotencyKey('o', 'Perpanjangan Paspor', '2026-09-03'),
      idempotencyKey('o', 'perpanjangan paspor', '2026-09-03'),
    );
  });

  test('collapses punctuation and spacing to one slug', () => {
    assert.equal(
      idempotencyKey('o', '  perpanjangan   paspor!  ', '2026-09-03'),
      'countercall:o:perpanjangan-paspor:2026-09-03:v1',
    );
  });

  test('never leaves a leading or trailing dash in the slug', () => {
    const key = idempotencyKey('o', '!!paspor!!', '2026-09-03');
    assert.ok(!key.includes(':-'));
    assert.ok(!key.includes('-:'));
  });
});

describe('parseArgs', () => {
  test('dry run is the default — a skill that dials by default dials by accident', () => {
    assert.equal(parseArgs([]).live, false);
  });

  test('--live flips the flag', () => {
    assert.equal(parseArgs(['--live']).live, true);
  });

  test('reads a value flag', () => {
    assert.equal(parseArgs(['--office', 'imigrasi-jaksel']).office, 'imigrasi-jaksel');
  });

  test('reads a quoted multi-word value', () => {
    assert.equal(parseArgs(['--procedure', 'perpanjangan paspor']).procedure, 'perpanjangan paspor');
  });

  test('reads several flags together', () => {
    const args = parseArgs(['--office', 'a', '--procedure', 'b', '--live']);
    assert.equal(args.office, 'a');
    assert.equal(args.procedure, 'b');
    assert.equal(args.live, true);
  });
});

describe('publishedRunSpec', () => {
  const WIRE = {
    published_run_spec: {
      id: 'rspec_1',
      version: 4,
      input_schema: { type: 'object' },
      result_schema: { type: 'object', additionalProperties: false, properties: {} },
    },
  };

  const SDK = {
    publishedRunSpec: {
      id: 'rspec_1',
      version: 4,
      inputSchema: { type: 'object' },
      resultSchema: { type: 'object', additionalProperties: false, properties: {} },
    },
  };

  test('reads the snake_case wire shape', () => {
    assert.equal(publishedRunSpec(WIRE)?.version, 4);
  });

  test('reads the camelCase TypeScript SDK shape', () => {
    assert.equal(publishedRunSpec(SDK)?.version, 4);
  });

  test('normalises both casings to the same object', () => {
    assert.deepEqual(publishedRunSpec(WIRE), publishedRunSpec(SDK));
  });

  test('surfaces the result schema from the SDK shape', () => {
    assert.equal(publishedRunSpec(SDK).resultSchema.additionalProperties, false);
  });

  test('returns null for a goal with no spec', () => {
    assert.equal(publishedRunSpec({}), null);
  });

  test('returns null rather than throwing on undefined', () => {
    assert.equal(publishedRunSpec(undefined), null);
  });
});

describe('diffContract', () => {
  const PINNED = { version: 1, result_fields: ['a', 'b'] };
  const live = (properties, extra = {}) => ({
    version: 1,
    resultSchema: { additionalProperties: false, properties, ...extra },
  });

  test('an exactly matching contract shows no drift', () => {
    assert.deepEqual(diffContract(PINNED, live({ a: {}, b: {} })), []);
  });

  test('a missing spec is drift, not a crash', () => {
    assert.deepEqual(diffContract(PINNED, null), ['no published RunSpec on the live Goal']);
  });

  test('a spec with no result schema is reported distinctly', () => {
    assert.deepEqual(diffContract(PINNED, { version: 1 }), [
      'published RunSpec carries no result schema',
    ]);
  });

  test('a version bump is drift — this is the guard the demo depends on', () => {
    const drift = diffContract(PINNED, { ...live({ a: {}, b: {} }), version: 2 });
    assert.ok(drift.includes('version 1 -> 2'));
  });

  test('a removed field is drift', () => {
    const drift = diffContract(PINNED, live({ a: {} }));
    assert.ok(drift.includes('removed field: b'));
  });

  test('a new field is drift — a silently widened contract still refuses the dial', () => {
    const drift = diffContract(PINNED, live({ a: {}, b: {}, c: {} }));
    assert.ok(drift.includes('new field: c'));
  });

  test('an opened additionalProperties is drift', () => {
    const drift = diffContract(PINNED, live({ a: {}, b: {} }, { additionalProperties: true }));
    assert.ok(drift.includes('additionalProperties is no longer false'));
  });

  test('reads the snake_case result_schema too', () => {
    const drift = diffContract(PINNED, {
      version: 1,
      result_schema: { additionalProperties: false, properties: { a: {}, b: {} } },
    });
    assert.deepEqual(drift, []);
  });

  test('reports every drift at once rather than the first', () => {
    const drift = diffContract(PINNED, { ...live({ a: {}, z: {} }), version: 3 });
    assert.ok(drift.length >= 3);
  });
});
