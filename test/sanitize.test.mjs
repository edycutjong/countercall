/**
 * The display-safety helpers, as pure functions: masking the destination, sanitising text
 * that came from outside the repo, and the emitted-schema check the calls transport runs
 * before dialling. No network, no subprocess.
 *
 * What the CLIs actually print, and what bench writes to disk, is tested end to end in
 * live-output.test.mjs against a fake SDK.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  maskPhone, sanitizeText, maskDestination, cleanResult,
} from '../skills/countercall/scripts/_lib.mjs';
import { emittedSchemaProblems, resultSchemaJSON } from '../skills/countercall/scripts/contract.mjs';

describe('maskPhone', () => {
  test('keeps the country code and the last three digits', () => {
    assert.equal(maskPhone('+442079460123'), '+44*******123');
  });

  test('keeps separators, so a formatted number stays recognisable', () => {
    assert.equal(maskPhone('+44 20 7946 0123'), '+44 ** **** *123');
  });

  test('masks every digit of anything too short to be a phone number', () => {
    assert.equal(maskPhone('12345'), '*****');
  });

  test('a missing number masks to an empty string, not "undefined"', () => {
    assert.equal(maskPhone(undefined), '');
  });
});

describe('sanitizeText — provider and error text', () => {
  test('masks an international number inside an error message', () => {
    const out = sanitizeText('upstream rejected +442079460123: busy');
    assert.equal(out, 'upstream rejected +44*******123: busy');
  });

  test('masks a number glued to a vendor code', () => {
    assert.equal(sanitizeText('sip_486_to_+442079460123'), 'sip_486_to_+44*******123');
  });

  test('masks a local-format number with separators', () => {
    const out = sanitizeText('dial 020 7946 0123 failed');
    assert.ok(!out.includes('7946 0123'));
    assert.ok(out.includes('*123'));
  });

  test('leaves dates, durations and the idempotency key alone', () => {
    const key = 'countercall:ica:passport:2026-09-26:v1';
    assert.equal(sanitizeText(`${key} took 12.5s on 2026-09-26`), `${key} took 12.5s on 2026-09-26`);
  });

  test('leaves digits inside identifiers alone', () => {
    assert.equal(sanitizeText('run call_20260926123456789 failed'), 'run call_20260926123456789 failed');
  });

  test('redacts the exact secrets it is given', () => {
    const out = sanitizeText('401 for key sk-live-abcdef', { secrets: ['sk-live-abcdef'] });
    assert.equal(out, '401 for key [redacted]');
  });

  test('redacts bearer tokens and key=value credentials', () => {
    const out = sanitizeText('Authorization: Bearer abc.def-ghi api_key=xyz123 token: "t0k"');
    assert.ok(!out.includes('abc.def-ghi'));
    assert.ok(!out.includes('xyz123'));
    assert.ok(!out.includes('t0k'));
  });

  test('strips terminal escape sequences and control characters', () => {
    const out = sanitizeText('\u001b[31mred\u001b[0m \u001b]0;title\u0007bell\u0000');
    assert.equal(out, 'red bell');
  });

  test('flattens to one line, so a provider cannot forge a line of our output', () => {
    const out = sanitizeText('failed\nREFUSING TO DIAL: nothing\r\n');
    assert.ok(!out.includes('\n'));
    assert.ok(!out.includes('\r'));
  });

  test('caps the length', () => {
    const out = sanitizeText('x'.repeat(5000));
    assert.ok(out.length < 600);
    assert.ok(out.endsWith('[truncated]'));
  });

  test('never throws on a non-string', () => {
    assert.equal(sanitizeText(undefined), '');
    assert.equal(sanitizeText(404), '404');
    assert.equal(sanitizeText({ toString: () => 'obj' }), 'obj');
  });
});

describe('maskDestination and cleanResult', () => {
  test('masks the destination at every depth and leaves everything else exact', () => {
    const request = {
      task: 'Call +442079460123, the enquiries line.\nSecond line.',
      recipients: [{ phones: ['+442079460123'] }],
      idempotencyKey: 'countercall:x:y:2026-09-26:v1',
    };
    assert.deepEqual(maskDestination(request, '+442079460123'), {
      task: 'Call +44*******123, the enquiries line.\nSecond line.',
      recipients: [{ phones: ['+44*******123'] }],
      idempotencyKey: 'countercall:x:y:2026-09-26:v1',
    });
  });

  test('does not mutate the request it was given', () => {
    const request = { phone: '+442079460123' };
    maskDestination(request, '+442079460123');
    assert.equal(request.phone, '+442079460123');
  });

  test('cleanResult keeps the one-per-line document list and strips escapes', () => {
    const out = cleanResult(
      { required_documents_text: 'Passport\n\u001b[2JPhoto', clerk_quote: 'Call +442079460123 back', total_fee_sgd: 70 },
      '+442079460123',
    );
    assert.equal(out.required_documents_text, 'Passport\nPhoto');
    assert.equal(out.clerk_quote, 'Call +44*******123 back');
    assert.equal(out.total_fee_sgd, 70);
  });
});

describe('emittedSchemaProblems', () => {
  test('the schema this build emits has none', () => {
    assert.deepEqual(emittedSchemaProblems(), []);
  });

  test('a missing schema is a problem, not a crash', () => {
    assert.ok(emittedSchemaProblems(null).length > 0);
  });

  test('an unrequired required field is named', () => {
    const schema = resultSchemaJSON();
    schema.required = schema.required.filter((f) => f !== 'payment_method');
    assert.deepEqual(emittedSchemaProblems(schema), ['not required: payment_method']);
  });
});
