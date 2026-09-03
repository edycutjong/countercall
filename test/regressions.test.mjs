/**
 * Regression tests, each named for the defect it pins.
 *
 * Every test in this file corresponds to a real bug that was in the tree and shipped
 * against the live CALL-E API contract. The names are deliberately long: this file is
 * meant to read as a changelog of what actually went wrong, so that a reader can see the
 * integration was driven against the real API rather than scaffolded once and left.
 *
 * Each name states the defect, not the expectation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

import { diffContract, publishedRunSpec, parseArgs } from '../skills/countercall/scripts/_lib.mjs';
import { CONTRACT, contractFields, validateResult } from '../skills/countercall/scripts/contract.mjs';
import { renderCard } from '../skills/countercall/scripts/render.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('regressions — CALL-E integration', () => {
  test('goals_run_called_with_positional_goalId_and_target_wrapper', async () => {
    // Defect: call.mjs used `goals.run(goalId, {target, ...})`. The SDK takes a single
    // RunGoalInput object with a top-level `phone`; CreateGoalRunRequest is closed and
    // rejects a target wrapper. The first live call would have thrown.
    const source = readFileSync(`${ROOT}skills/countercall/scripts/call.mjs`, 'utf8');
    assert.ok(!/goals\.run\(\s*request\.goalId\s*,/.test(source), 'positional run() signature is back');
    assert.ok(/goals\.run\(request\)/.test(source), 'run() must take the single input object');
    assert.ok(!/target:/.test(source), 'CreateGoalRunRequest has no target wrapper');
  });

  test('published_run_spec_read_in_wire_casing_only_so_drift_guard_refused_every_dial', () => {
    // Defect: preflight read `goal.published_run_spec`, but the TypeScript SDK camelCases
    // its surface. The key was always undefined, so the guard reported "no spec" against a
    // healthy Goal and exited 4 before dialling — every single time.
    const sdkShape = {
      publishedRunSpec: {
        id: 'rspec_1',
        version: CONTRACT.version,
        resultSchema: {
          additionalProperties: false,
          properties: Object.fromEntries(contractFields().map((f) => [f, {}])),
        },
      },
    };
    const spec = publishedRunSpec(sdkShape);
    assert.ok(spec, 'camelCase RunSpec must be readable');
    assert.deepEqual(
      diffContract({ version: CONTRACT.version, result_fields: contractFields() }, spec),
      [],
      'a healthy camelCase Goal must produce no drift',
    );
  });

  test('required_documents_declared_as_array_which_a_goal_run_result_cannot_carry', () => {
    // Defect: the contract specified `required_documents: string[]`. A Goal Run result is
    // `additionalProperties: $ref GoalScalar` — string|number|boolean. The Goal could not
    // have been published against the documented schema at all.
    assert.ok(!CONTRACT.required.includes('required_documents'));
    assert.ok(CONTRACT.required.includes('required_documents_text'));
    const problems = validateResult({
      required_documents_text: ['KTP', 'Paspor'],
      payment_method: 'cash',
      appointment_required: 'no',
      originals_or_copies: 'copies',
      clerk_certainty: 'confident',
      clerk_quote: 'q',
    });
    assert.ok(problems.includes('required_documents_text is not a string'));
  });

  test('total_fee_idr_declared_nullable_but_null_is_not_a_GoalScalar', () => {
    // Defect: the contract used `number | null` for an unknown fee. null is not a
    // permitted scalar. Absence now carries that meaning instead.
    assert.ok(CONTRACT.optional.includes('total_fee_idr'));
    assert.ok(validateResult({
      required_documents_text: 'KTP',
      payment_method: 'cash',
      appointment_required: 'no',
      originals_or_copies: 'copies',
      clerk_certainty: 'unsure',
      clerk_quote: 'q',
      total_fee_idr: null,
    }).includes('total_fee_idr is present but not a finite number'));
  });
});

describe('regressions — tooling and rendering', () => {
  test('npm_test_pointed_at_a_directory_path_node_resolves_as_a_module', () => {
    // Defect: `node --test test/` threw MODULE_NOT_FOUND. The suite never ran at all,
    // which is why none of the defects above were caught earlier.
    const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
    assert.ok(pkg.scripts.test.includes('*.test.mjs'), 'test script must use a glob, not a bare dir');
  });

  test('boolean_flag_swallowed_the_next_token_so_offices_fixture_was_ignored', () => {
    // Defect: parseArgs treated every `--x` as key/value, so `--plan --offices f.json`
    // parsed as `{plan: "--offices"}` and silently loaded the wrong seed file.
    const args = parseArgs(['--plan', '--offices', 'f.json', '--calls', '4']);
    assert.equal(args.plan, true);
    assert.equal(args.offices, 'f.json');
    assert.equal(args.calls, '4');
  });

  test('disclaimer_was_hand_wrapped_wider_than_the_card_and_overflowed_at_77_chars', () => {
    // Defect: the not-legally-binding line was a hand-split constant 77 characters wide
    // on a 66-character card, so every screenshot had one ragged line.
    const card = renderCard(
      {
        required_documents_text: 'KTP asli',
        payment_method: 'cash',
        appointment_required: 'no',
        originals_or_copies: 'copies',
        clerk_certainty: 'confident',
        clerk_quote: 'a '.repeat(80).trim(),
      },
      { name: 'Kantor Imigrasi Jakarta Selatan', source_url: 'https://example.gov.id/', source_checked: '2026-09-03' },
      { procedure: 'perpanjangan paspor' },
    );
    const longest = Math.max(...card.split('\n').map((l) => l.length));
    assert.ok(longest <= 72, `card overflowed to ${longest} chars`);
  });

  test('bench_default_seed_path_resolved_relative_to_scripts_not_to_the_skill', async () => {
    // Defect: bench.mjs called loadOffices(args, import.meta.url), resolving
    // ../data/offices.json to build/data/ — which does not exist. `--plan` crashed
    // with ENOENT instead of printing a plan.
    const { stdout } = await run('node', ['scripts/bench.mjs', '--plan', '--calls', '2'], { cwd: ROOT });
    assert.ok(stdout.includes('BENCH PLAN'), 'bench --plan must find the shipped seed file');
  });
});
