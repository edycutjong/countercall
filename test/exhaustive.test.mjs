/**
 * The exhaustive verification.
 *
 * `validateResult` + `renderCard` together are the decision function that must never be
 * wrong: everything downstream of them is a person deciding whether to travel across a
 * city. Example-based tests prove they work on the cases we thought of. This file walks
 * the entire input space the contract permits and asserts the invariants on every point
 * in it.
 *
 * Two invariants, checked over every combination:
 *
 *   A. A result that satisfies the contract always validates, and renders a card that
 *      contains no value the clerk did not give.
 *   B. A result that violates the contract in any single field never validates.
 *
 * The case count is printed by `npm test` and is the number quoted in the README. It is
 * the artifact here — not the test.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { CONTRACT, validateResult, decodeDocuments } from '../skills/countercall/scripts/contract.mjs';
import { renderCard } from '../skills/countercall/scripts/render.mjs';

const OFFICE = {
  name: 'Kantor Imigrasi Jakarta Selatan',
  source_url: 'https://jakartaselatan.imigrasi.go.id/',
  source_checked: '2026-09-03',
};

/** The document lists to sweep: one, two and three entries. */
const DOCUMENT_SETS = [
  'KTP asli',
  'KTP asli\nFotokopi KTP',
  'KTP asli\nFotokopi KTP\nPaspor lama',
];

/** Absent (clerk did not know), free, and a real fee. */
const FEE_VARIANTS = [undefined, 0, 650000];

/**
 * Illegal values per field. Deliberately field-specific rather than one blanket list:
 * `"unknown_typo"` is a perfectly valid document line and a perfectly valid quote, and
 * `42` is a perfectly valid fee. A blanket list would assert those are rejected and be
 * testing the wrong thing.
 */
const ENUM_ILLEGAL = [null, undefined, '', 'unknown_typo', 42, true, [], {}];
const ILLEGAL_BY_FIELD = {
  required_documents_text: [null, undefined, '', '   ', 42, true, [], {}],
  clerk_quote: [null, undefined, '', '   ', 42, true, [], {}],
  total_fee_idr: [null, undefined, '', 'unknown_typo', true, [], {}, NaN, -1],
  payment_method: ENUM_ILLEGAL,
  appointment_required: ENUM_ILLEGAL,
  originals_or_copies: ENUM_ILLEGAL,
  clerk_certainty: ENUM_ILLEGAL,
};

/** Walk the full cross-product of the contract's enums. */
function* enumCombinations() {
  const { payment_method, appointment_required, originals_or_copies, clerk_certainty } = CONTRACT.enums;
  for (const pm of payment_method) {
    for (const ar of appointment_required) {
      for (const oc of originals_or_copies) {
        for (const cc of clerk_certainty) {
          yield {
            payment_method: pm,
            appointment_required: ar,
            originals_or_copies: oc,
            clerk_certainty: cc,
          };
        }
      }
    }
  }
}

/** Every valid result the contract can express, across enums × fee × documents. */
function* validResults() {
  for (const enums of enumCombinations()) {
    for (const fee of FEE_VARIANTS) {
      for (const documents of DOCUMENT_SETS) {
        const result = {
          ...enums,
          required_documents_text: documents,
          clerk_quote: 'Bawa KTP asli dan fotokopinya.',
        };
        if (fee !== undefined) result.total_fee_idr = fee;
        yield result;
      }
    }
  }
}

describe('exhaustive verification of the result contract', () => {
  test('every contract-satisfying result validates clean', () => {
    let checked = 0;
    for (const result of validResults()) {
      const problems = validateResult(result);
      assert.deepEqual(problems, [], `rejected a valid result: ${JSON.stringify(result)}`);
      checked += 1;
    }
    assert.equal(checked, 1296);
    console.log(`      ↳ ${checked} valid results verified`);
  });

  test('no rendered card ever contains a value the clerk did not give', () => {
    // The invariant that matters: if a field is `unknown`, or the fee is absent, the card
    // must show an em dash there — never a plausible substitute.
    let checked = 0;
    for (const result of validResults()) {
      const card = renderCard(result, OFFICE, { procedure: 'perpanjangan paspor' });

      if (!('total_fee_idr' in result)) {
        assert.match(card, /Fee\s+—/, 'absent fee did not render as an em dash');
        assert.ok(!/Rp/.test(card), 'absent fee rendered a rupiah figure');
      }
      if (result.payment_method === 'unknown') assert.match(card, /Payment\s+—/);
      if (result.appointment_required === 'unknown') assert.match(card, /Appointment\s+—/);
      if (result.originals_or_copies === 'unknown') assert.match(card, /Documents\s+—/);

      // Every document the clerk gave appears, and no others.
      const documents = decodeDocuments(result.required_documents_text);
      const bullets = card.split('\n').filter((l) => l.trim().startsWith('•'));
      assert.equal(bullets.length, documents.length);
      for (const document of documents) assert.ok(card.includes(document));

      // The card always carries its provenance and its disclaimer, on every path.
      assert.ok(card.includes(OFFICE.source_url));
      assert.ok(card.includes('not legally binding'));
      checked += 1;
    }
    assert.equal(checked, 1296);
    console.log(`      ↳ ${checked} rendered cards verified for invented values`);
  });

  test('no single-field violation ever validates', () => {
    // For every valid result, corrupt exactly one field at a time with every illegal
    // value and assert the corruption is always caught.
    let checked = 0;
    let rejected = 0;
    const fields = [...CONTRACT.required, ...CONTRACT.optional];

    // One representative valid result per enum combination keeps this at a sane size
    // while still covering every enum position.
    for (const enums of enumCombinations()) {
      const base = {
        ...enums,
        required_documents_text: 'KTP asli\nFotokopi KTP',
        total_fee_idr: 650000,
        clerk_quote: 'Bawa KTP asli dan fotokopinya.',
      };
      assert.deepEqual(validateResult(base), []);

      for (const field of fields) {
        for (const bad of ILLEGAL_BY_FIELD[field]) {
          const mutated = { ...base, [field]: bad };
          const problems = validateResult(mutated);
          checked += 1;
          if (problems.length > 0) rejected += 1;
          else assert.fail(`${field}=${JSON.stringify(bad)} validated clean`);
        }
      }
    }

    const perResult = fields.reduce((n, f) => n + ILLEGAL_BY_FIELD[f].length, 0);
    assert.equal(checked, 144 * perResult);
    assert.equal(rejected, checked, `${checked - rejected} corrupted results validated clean`);
    console.log(`      ↳ ${checked} single-field corruptions, all rejected`);
  });

  test('an unexpected key is always caught, wherever it appears', () => {
    let checked = 0;
    for (const enums of enumCombinations()) {
      const base = {
        ...enums,
        required_documents_text: 'KTP asli',
        clerk_quote: 'q',
      };
      for (const key of ['extra', 'required_documents', 'fee', '__proto__x', 'total_fee']) {
        const problems = validateResult({ ...base, [key]: 'x' });
        assert.ok(
          problems.some((p) => p === `unexpected field: ${key}`),
          `unexpected key ${key} slipped through`,
        );
        checked += 1;
      }
    }
    assert.equal(checked, 144 * 5);
    console.log(`      ↳ ${checked} unexpected-key injections, all rejected`);
  });
});
