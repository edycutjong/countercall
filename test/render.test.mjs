import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { renderCard, renderFailure, formatFeeIdr } from '../skills/countercall/scripts/render.mjs';

const OFFICE = {
  id: 'imigrasi-jaksel',
  name: 'Kantor Imigrasi Jakarta Selatan',
  city: 'Jakarta Selatan',
  phone_e164: '+622112345678',
  source_url: 'https://jakartaselatan.imigrasi.go.id/',
  source_checked: '2026-09-03',
};

const RESULT = {
  required_documents_text: 'KTP asli\nFotokopi KTP\nPaspor lama',
  total_fee_idr: 650000,
  payment_method: 'both',
  appointment_required: 'yes',
  originals_or_copies: 'both',
  clerk_certainty: 'confident',
  clerk_quote: 'Bawa KTP asli dan fotokopinya, sama paspor lama.',
};

const META = { procedure: 'perpanjangan paspor', runId: 'grun_abc123' };
const card = (result = RESULT, meta = META) => renderCard(result, OFFICE, meta);

describe('formatFeeIdr', () => {
  test('formats a fee in Indonesian grouping', () => {
    assert.match(formatFeeIdr(650000), /^Rp 650[.,]000$/);
  });

  test('formats a free procedure as zero, not as unknown', () => {
    assert.equal(formatFeeIdr(0), 'Rp 0');
  });

  test('an absent fee renders as an em dash, never as a number', () => {
    assert.equal(formatFeeIdr(undefined), '—');
  });

  test('a null fee renders as an em dash', () => {
    assert.equal(formatFeeIdr(null), '—');
  });

  test('a NaN fee renders as an em dash rather than "NaN"', () => {
    assert.equal(formatFeeIdr(NaN), '—');
  });

  test('a string fee renders as an em dash rather than being coerced', () => {
    assert.equal(formatFeeIdr('650000'), '—');
  });
});

describe('renderCard shows what the clerk said', () => {
  test('names the office', () => {
    assert.ok(card().includes(OFFICE.name));
  });

  test('names the procedure', () => {
    assert.ok(card().includes('perpanjangan paspor'));
  });

  test('lists every document, in the clerk’s own terms', () => {
    const output = card();
    assert.ok(output.includes('KTP asli'));
    assert.ok(output.includes('Fotokopi KTP'));
    assert.ok(output.includes('Paspor lama'));
  });

  test('renders one bullet per document', () => {
    const bullets = card().split('\n').filter((line) => line.trim().startsWith('•'));
    assert.equal(bullets.length, 3);
  });

  test('shows the fee', () => {
    assert.match(card(), /Rp 650[.,]000/);
  });

  test('shows the payment method in words, not the raw enum', () => {
    const output = card();
    assert.ok(output.includes('Cash or card'));
    assert.ok(!output.includes('both\n'));
  });

  test('shows the appointment answer as an instruction', () => {
    assert.ok(card().includes('book before going'));
  });

  test('quotes the clerk verbatim', () => {
    assert.ok(card().includes(RESULT.clerk_quote));
  });

  test('carries the published source URL', () => {
    assert.ok(card().includes(OFFICE.source_url));
  });

  test('carries the date the number was checked', () => {
    assert.ok(card().includes('2026-09-03'));
  });

  test('carries the not-legally-binding line', () => {
    assert.ok(card().includes('not legally binding'));
  });

  test('shows the CALL-E run id when one is supplied', () => {
    assert.ok(card().includes('grun_abc123'));
  });

  test('omits the run id row entirely when there is none', () => {
    assert.ok(!card(RESULT, { procedure: 'x' }).includes('CALL-E run'));
  });
});

describe('renderCard never invents what the clerk did not say', () => {
  test('an absent fee leaves the row blank, not filled with a typical value', () => {
    const noFee = { ...RESULT };
    delete noFee.total_fee_idr;
    const output = card(noFee);
    assert.ok(output.includes('Fee'));
    assert.ok(!output.includes('650'));
    assert.match(output, /Fee\s+—/);
  });

  test('an unknown payment method renders as an em dash', () => {
    assert.match(card({ ...RESULT, payment_method: 'unknown' }), /Payment\s+—/);
  });

  test('an unknown appointment answer renders as an em dash', () => {
    assert.match(card({ ...RESULT, appointment_required: 'unknown' }), /Appointment\s+—/);
  });

  test('an unknown originals answer renders as an em dash', () => {
    assert.match(card({ ...RESULT, originals_or_copies: 'unknown' }), /Documents\s+—/);
  });

  test('an unknown field is shown as unknown, not silently omitted', () => {
    // The gap must remain visible: a dropped row reads as "there was nothing to say".
    const output = card({ ...RESULT, payment_method: 'unknown' });
    assert.ok(output.includes('Payment'));
  });
});

describe('renderCard surfaces certainty', () => {
  test('a confident clerk is reported as confident', () => {
    assert.ok(card().includes('answered confidently'));
  });

  test('an unsure clerk produces a verify-in-person warning', () => {
    assert.ok(card({ ...RESULT, clerk_certainty: 'unsure' }).includes('Verify these details in person'));
  });

  test('a refusal is reported rather than hidden', () => {
    assert.ok(card({ ...RESULT, clerk_certainty: 'refused' }).includes('declined to answer'));
  });

  test('certainty appears on every card regardless of value', () => {
    for (const value of ['confident', 'unsure', 'refused']) {
      const output = card({ ...RESULT, clerk_certainty: value });
      assert.ok(output.includes('clerk'), `certainty missing for ${value}`);
    }
  });
});

describe('renderCard output shape', () => {
  test('is plain text with no ANSI escape codes, so it screenshots cleanly', () => {
    // eslint-disable-next-line no-control-regex
    assert.ok(!/\[/.test(card()));
  });

  test('is deterministic — same input, same bytes', () => {
    assert.equal(card(), card());
  });

  test('wraps a long clerk quote instead of running off the card', () => {
    const long = 'a '.repeat(120).trim();
    const output = card({ ...RESULT, clerk_quote: long });
    const longest = Math.max(...output.split('\n').map((line) => line.length));
    assert.ok(longest <= 72, `longest line was ${longest}`);
  });
});

describe('renderFailure is honest and terminal', () => {
  const failure = (code) => renderFailure(code, OFFICE, META);

  test('no_answer explains that the line did not answer', () => {
    assert.ok(failure('no_answer').includes('did not answer'));
  });

  test('declined explains the office refused an automated caller', () => {
    assert.ok(failure('declined').includes('declined'));
  });

  test('result_invalid says the answer did not match the contract', () => {
    assert.ok(failure('result_invalid').includes('did not match the contract'));
  });

  test('timed_out is routed', () => {
    assert.ok(failure('timed_out').includes('No usable answer'));
  });

  test('call_failed is routed', () => {
    assert.ok(failure('call_failed').includes('could not be completed'));
  });

  test('canceled is routed', () => {
    assert.ok(failure('canceled').includes('cancelled'));
  });

  test('result_unavailable is routed', () => {
    assert.ok(failure('result_unavailable').includes('no structured answer'));
  });

  test('result_failed is routed', () => {
    assert.ok(failure('result_failed').includes('could not be processed'));
  });

  test('every GoalRunError code in the CALL-E schema is routed to real prose', () => {
    // The full enum from components.schemas.GoalRunError.code.
    const codes = [
      'call_failed', 'no_answer', 'declined', 'timed_out',
      'canceled', 'result_invalid', 'result_unavailable', 'result_failed',
    ];
    for (const code of codes) {
      assert.ok(!failure(code).includes('Unrouted'), `${code} is unrouted`);
    }
  });

  test('an unknown code degrades to a visible "unrouted" line rather than a blank card', () => {
    assert.ok(failure('something_new').includes('Unrouted error code'));
  });

  test('states plainly that no partial checklist is rendered', () => {
    assert.ok(failure('no_answer').includes('No partial checklist is ever rendered'));
  });

  test('never leaks a document row into a failure card', () => {
    for (const code of ['no_answer', 'declined', 'result_invalid', 'timed_out']) {
      assert.ok(!failure(code).includes('BRING'), `${code} leaked a checklist`);
    }
  });

  test('never shows a fee on a failure card', () => {
    assert.ok(!failure('no_answer').includes('Rp'));
  });

  test('still names the office, so the user knows what was tried', () => {
    assert.ok(failure('no_answer').includes(OFFICE.name));
  });
});
