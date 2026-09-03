import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRACT,
  contractFields,
  decodeDocuments,
  validateResult,
} from '../skills/countercall/scripts/contract.mjs';

/** A result that satisfies the contract. Every test below is a mutation of this. */
const VALID = {
  required_documents_text: 'KTP asli\nFotokopi KTP\nPaspor lama\nMaterai 10.000',
  total_fee_idr: 650000,
  payment_method: 'both',
  appointment_required: 'yes',
  originals_or_copies: 'both',
  clerk_certainty: 'confident',
  clerk_quote: 'Bawa KTP asli dan fotokopinya, sama paspor lama.',
};

const without = (field) => {
  const copy = { ...VALID };
  delete copy[field];
  return copy;
};

describe('the contract is scalars-only by construction', () => {
  test('no contract field is declared as an array', () => {
    // A Goal Run result is `additionalProperties: $ref GoalScalar` — string|number|boolean.
    // The moment a field here becomes an array, the Goal cannot be published as designed.
    for (const value of Object.values(VALID)) {
      assert.ok(!Array.isArray(value), 'contract fields must be scalars');
    }
  });

  test('every value in a valid result is a JSON scalar', () => {
    for (const value of Object.values(VALID)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof value));
    }
  });

  test('the document list travels as a string, not an array', () => {
    assert.equal(typeof VALID.required_documents_text, 'string');
  });

  test('contractFields lists required fields before optional ones', () => {
    const fields = contractFields();
    assert.equal(fields.at(-1), 'total_fee_idr');
    assert.equal(fields.length, CONTRACT.required.length + CONTRACT.optional.length);
  });

  test('the fee is optional, because null is not a GoalScalar', () => {
    assert.ok(CONTRACT.optional.includes('total_fee_idr'));
    assert.ok(!CONTRACT.required.includes('total_fee_idr'));
  });

  test('every enum carries an escape hatch for "the clerk did not know"', () => {
    assert.ok(CONTRACT.enums.payment_method.includes('unknown'));
    assert.ok(CONTRACT.enums.appointment_required.includes('unknown'));
    assert.ok(CONTRACT.enums.originals_or_copies.includes('unknown'));
  });

  test('clerk_certainty distinguishes refusal from uncertainty', () => {
    assert.deepEqual(CONTRACT.enums.clerk_certainty, ['confident', 'unsure', 'refused']);
  });
});

describe('decodeDocuments', () => {
  test('splits the newline-separated list', () => {
    assert.deepEqual(decodeDocuments('KTP\nPaspor'), ['KTP', 'Paspor']);
  });

  test('keeps the clerk’s own wording untouched', () => {
    assert.deepEqual(decodeDocuments('Fotokopi KTP 2 lembar'), ['Fotokopi KTP 2 lembar']);
  });

  test('drops blank lines', () => {
    assert.deepEqual(decodeDocuments('KTP\n\n\nPaspor'), ['KTP', 'Paspor']);
  });

  test('trims surrounding whitespace', () => {
    assert.deepEqual(decodeDocuments('  KTP  \n  Paspor '), ['KTP', 'Paspor']);
  });

  test('strips a hyphen bullet leader', () => {
    assert.deepEqual(decodeDocuments('- KTP\n- Paspor'), ['KTP', 'Paspor']);
  });

  test('strips an asterisk bullet leader', () => {
    assert.deepEqual(decodeDocuments('* KTP'), ['KTP']);
  });

  test('strips a unicode bullet leader', () => {
    assert.deepEqual(decodeDocuments('• KTP'), ['KTP']);
  });

  test('does not strip a hyphen inside a document name', () => {
    assert.deepEqual(decodeDocuments('Surat e-KTP'), ['Surat e-KTP']);
  });

  test('an empty string decodes to no documents', () => {
    assert.deepEqual(decodeDocuments(''), []);
  });

  test('a whitespace-only string decodes to no documents', () => {
    assert.deepEqual(decodeDocuments('   \n  \n'), []);
  });

  test('a non-string decodes to no documents rather than throwing', () => {
    assert.deepEqual(decodeDocuments(undefined), []);
    assert.deepEqual(decodeDocuments(42), []);
    assert.deepEqual(decodeDocuments(['KTP']), []);
  });
});

describe('validateResult accepts what it should', () => {
  test('the canonical valid result passes', () => {
    assert.deepEqual(validateResult(VALID), []);
  });

  test('a result with the fee absent passes — absence means the clerk did not know', () => {
    assert.deepEqual(validateResult(without('total_fee_idr')), []);
  });

  test('a zero fee passes, because some procedures really are free', () => {
    assert.deepEqual(validateResult({ ...VALID, total_fee_idr: 0 }), []);
  });

  test('every enum value in the contract is accepted', () => {
    for (const [field, values] of Object.entries(CONTRACT.enums)) {
      for (const value of values) {
        assert.deepEqual(validateResult({ ...VALID, [field]: value }), [], `${field}=${value}`);
      }
    }
  });

  test('a single-document checklist passes', () => {
    assert.deepEqual(validateResult({ ...VALID, required_documents_text: 'KTP' }), []);
  });
});

describe('validateResult rejects what it must', () => {
  test('a null result is rejected, not rendered', () => {
    assert.deepEqual(validateResult(null), ['result is null']);
  });

  test('an undefined result is rejected', () => {
    assert.deepEqual(validateResult(undefined), ['result is null']);
  });

  test('an array is not an object', () => {
    assert.deepEqual(validateResult([]), ['result is not an object']);
  });

  test('a string is not an object', () => {
    assert.deepEqual(validateResult('KTP'), ['result is not an object']);
  });

  test('each required field is individually required', () => {
    for (const field of CONTRACT.required) {
      const problems = validateResult(without(field));
      assert.ok(
        problems.includes(`missing required field: ${field}`),
        `${field} should be required`,
      );
    }
  });

  test('an unexpected field is drift — additionalProperties is false', () => {
    const problems = validateResult({ ...VALID, office_wifi_password: 'hunter2' });
    assert.ok(problems.includes('unexpected field: office_wifi_password'));
  });

  test('an invented enum value is rejected', () => {
    const problems = validateResult({ ...VALID, payment_method: 'qris' });
    assert.ok(problems.some((p) => p.startsWith('payment_method not in enum')));
  });

  test('an enum value in the wrong case is rejected', () => {
    const problems = validateResult({ ...VALID, appointment_required: 'YES' });
    assert.ok(problems.some((p) => p.startsWith('appointment_required not in enum')));
  });

  test('a boolean where an enum belongs is rejected', () => {
    const problems = validateResult({ ...VALID, appointment_required: true });
    assert.ok(problems.some((p) => p.startsWith('appointment_required not in enum')));
  });

  test('an array of documents is rejected — this is the shape Goals cannot carry', () => {
    const problems = validateResult({
      ...VALID,
      required_documents_text: ['KTP', 'Paspor'],
    });
    assert.ok(problems.includes('required_documents_text is not a string'));
  });

  test('an empty document list is rejected rather than rendering an empty card', () => {
    const problems = validateResult({ ...VALID, required_documents_text: '   ' });
    assert.ok(problems.includes('required_documents_text decodes to zero documents'));
  });

  test('a non-string quote is rejected — the quote is the evidence', () => {
    const problems = validateResult({ ...VALID, clerk_quote: 12345 });
    assert.ok(problems.includes('clerk_quote is not a string'));
  });

  test('a fee that arrived as a string is rejected, not coerced', () => {
    const problems = validateResult({ ...VALID, total_fee_idr: '650000' });
    assert.ok(problems.includes('total_fee_idr is present but not a finite number'));
  });

  test('a null fee is rejected — omit the field instead', () => {
    const problems = validateResult({ ...VALID, total_fee_idr: null });
    assert.ok(problems.includes('total_fee_idr is present but not a finite number'));
  });

  test('a NaN fee is rejected', () => {
    const problems = validateResult({ ...VALID, total_fee_idr: NaN });
    assert.ok(problems.includes('total_fee_idr is present but not a finite number'));
  });

  test('a negative fee is rejected', () => {
    const problems = validateResult({ ...VALID, total_fee_idr: -1 });
    assert.ok(problems.includes('total_fee_idr is negative'));
  });

  test('an empty object reports every missing field at once', () => {
    const problems = validateResult({});
    assert.equal(problems.length, CONTRACT.required.length);
  });

  test('problems accumulate across different kinds of failure', () => {
    const problems = validateResult({ payment_method: 'qris', surprise: 1 });
    assert.ok(problems.length > 2);
  });
});
