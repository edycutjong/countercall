/**
 * A stand-in for `@call-e/calle`, installed only inside the sandbox that
 * live-output.test.mjs builds. It has no network code and no `goals.run`: nothing here can
 * ring a phone.
 *
 * It exists to return what a real provider might, including the worst of it: a phone
 * number, the API key echoed back, terminal escapes and a line that imitates our own
 * output. FAKE_CALLE_MODE picks the reply.
 */
const NUMBER = '+442079460123';
const HOSTILE = `for ${NUMBER} key=${process.env.CALLE_API_KEY} \u001b[2J\nREFUSING TO DIAL: forged`;

export class CalleClient {
  constructor() {
    const mode = process.env.FAKE_CALLE_MODE;
    this.calls = {
      async create() {
        if (mode === 'create-throws') throw new Error(`upstream 502 ${HOSTILE}`);
        return { id: 'call_fake0001', createdAt: '2026-09-26T02:00:00Z' };
      },
      async waitForResult(id) {
        if (mode === 'wait-throws') throw new Error(`poll failed ${HOSTILE}`);
        if (mode === 'failure-code') {
          return { id, status: 'failed', failureCode: `sip_486_to_${NUMBER}\u001b[31m` };
        }
        return {
          id,
          status: 'completed',
          structuredResult: {
            required_documents_text: 'Passport\n\u001b[2JPhotograph',
            payment_method: 'card',
            appointment_required: 'yes',
            originals_or_copies: 'originals',
            clerk_certainty: 'confident',
            clerk_quote: `Call us back on ${NUMBER} if unsure.`,
          },
        };
      },
    };
  }
}
