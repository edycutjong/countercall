#!/usr/bin/env node
/**
 * emit_goal_spec.mjs — print the Goal exactly as it must be published.
 *
 * Publishing a Goal is not a Developer API operation and is not an MCP tool either — the
 * authorized CLI exposes only plan_call, run_call, get_call_run and track_ui_events. So the
 * Goal is created by a human in CALL-E Chat, which means the published schema and the schema
 * this code validates against are two hand-kept copies of one thing.
 *
 * That is exactly the drift the pinned contract exists to catch, and the cheapest way to not
 * have it is to never type the schema twice: this generates it FROM `contract.mjs`, so the
 * thing pasted into CALL-E Chat is derived from the thing `validateResult` enforces.
 *
 *   node scripts/emit_goal_spec.mjs            human-readable, for pasting
 *   node scripts/emit_goal_spec.mjs --json     just the result_schema
 *
 * After publishing, set CONTRACT.version to the version CALL-E assigns, then run
 * `node scripts/verify_live.mjs` to confirm zero drift against the live Goal.
 */
import { CONTRACT, contractFields } from '../skills/countercall/scripts/contract.mjs';

const DESCRIPTIONS = {
  required_documents_text:
    'Every document the caller must physically bring, one per line, separated by newlines. '
    + 'Use the clerk\'s own words. Do NOT use a JSON array — a Goal Run result is a flat map '
    + 'of scalars and arrays are not expressible. Do not invent items the clerk did not say.',
  total_fee_idr:
    'The total fee in Indonesian rupiah, as a NUMBER with no separators or currency symbol '
    + '(e.g. 650000). OMIT THIS FIELD ENTIRELY if the clerk did not state a fee. Never guess, '
    + 'never use 0 to mean unknown, never give a typical or published figure.',
  payment_method: 'How the fee can be paid, exactly as the clerk described it.',
  appointment_required: 'Whether an appointment must be booked before attending in person.',
  originals_or_copies: 'Whether the documents must be originals, photocopies, or both.',
  clerk_certainty:
    'How certain the clerk sounded about this answer overall. Use "unsure" if they hedged, '
    + 'guessed, or said to confirm at the counter. Use "refused" if they declined to answer.',
  clerk_quote:
    'One verbatim sentence the clerk actually said, in their own language, that best supports '
    + 'the answer above. This is the evidence for every other field. Never paraphrase, never '
    + 'translate, never leave empty.',
};

const TYPES = { total_fee_idr: 'number' };

const properties = {};
for (const f of contractFields()) {
  properties[f] = { type: TYPES[f] ?? 'string', description: DESCRIPTIONS[f] };
  if (CONTRACT.enums[f]) properties[f].enum = CONTRACT.enums[f];
}

const resultSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...CONTRACT.required],
  properties,
};

const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['office_name', 'procedure', 'city'],
  properties: {
    office_name: { type: 'string', description: 'The office being called, e.g. "Kantor Imigrasi Jakarta Selatan".' },
    procedure: { type: 'string', description: 'The procedure asked about, in the office\'s own words, e.g. "perpanjangan paspor".' },
    city: { type: 'string', description: 'The city the office is in, e.g. "Jakarta Selatan".' },
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(resultSchema, null, 2));
  process.exit(0);
}

const PROMPT = `You are calling a government service counter on behalf of a member of the public.
Speak Indonesian throughout.

Open the call with exactly this, before asking anything:
"Selamat pagi. Ini asisten otomatis yang menelepon atas nama seorang warga. Saya ingin
menanyakan dokumen apa saja yang diperlukan untuk satu layanan. Apakah sekarang waktu yang
tepat?"

If they say no, are unsatisfied when they ask what this is, or ask to be removed: thank them
and end the call immediately. Do not re-ask, do not rephrase, do not call back.

If they agree, ask what a person must bring for {{procedure}} at {{office_name}} in {{city}}.
Ask only about the procedure. Never mention or ask for any personal detail about the caller.

Establish, in this order:
  1. every document to bring
  2. whether originals or photocopies are needed
  3. the total fee
  4. whether it can be paid by cash or card
  5. whether an appointment must be booked first

Ask at most one short follow-up per point. Do not press if they are unsure — record the
uncertainty instead. If the clerk does not know something, that is a complete and acceptable
answer: leave the field out rather than guessing.

Before ending, thank them by name if they gave one.

CRITICAL: never invent, estimate, round, or infer any value. If the clerk did not say it, it
does not go in the result. A missing fee is missing. An invented one sends someone across a
city with the wrong money.`;

const line = (c = '─') => c.repeat(78);

console.log(`
${line('━')}
  PUBLISH THIS GOAL IN CALL-E CHAT
  Generated from skills/countercall/scripts/contract.mjs — do not hand-edit either copy.
  Pinned contract version: ${CONTRACT.version}
${line('━')}

${line()}
1 · GOAL PROMPT
${line()}
${PROMPT}

${line()}
2 · INPUT SCHEMA  (variables the client sends)
${line()}
${JSON.stringify(inputSchema, null, 2)}

${line()}
3 · RESULT SCHEMA  (what the agent must return)
${line()}
${JSON.stringify(resultSchema, null, 2)}

${line()}
4 · CHECKS BEFORE YOU PUBLISH
${line()}
  · additionalProperties is false — an unexpected key must fail, not pass
  · required lists ${CONTRACT.required.length} fields; total_fee_idr is deliberately NOT among them
  · total_fee_idr is a number, and is OMITTED when unknown — never null, never 0
  · required_documents_text is a STRING with newlines, never an array
  · every enum carries its "clerk did not know" value:
${Object.entries(CONTRACT.enums).map(([k, v]) => `      ${k.padEnd(22)} ${v.join(' | ')}`).join('\n')}

${line()}
5 · AFTER PUBLISHING
${line()}
  1. Copy the Goal id into ~/.config/calle/env as COUNTERCALL_GOAL_ID
  2. Set CONTRACT.version in contract.mjs to the version CALL-E assigned
  3. node scripts/verify_live.mjs      -> must report zero drift
${line('━')}
`);
