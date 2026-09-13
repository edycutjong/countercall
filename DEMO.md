<!--
  Filled 2026-09-13 from two real calls placed 2026-09-10. The receipt table is the verbatim
  output of `npm run bench -- --report` over bench/records.json; the transcript is the
  verbatim transcript_turns of GET /v1/calls/call_h9t6ZZJ_2kG_fxTJXlOQgw. Nothing here is
  an estimate.
-->

# DEMO

What this project does, how to see it for yourself, and the numbers behind the claims.

For the 30-second version, read [JUDGE.md](JUDGE.md).

---

## The claim

**CounterCall places one real CALL-E phone call to a government service counter and returns a
validated checklist of what to bring — and leaves a field empty when the clerk did not know
it.** So far it has placed two real calls to Singapore agencies and returned zero checklists:
one line is an IVR that CALL-E cannot key through, the other was busy. Both are below, in full.

## Reproduce it — the real path

This places an actual phone call to an actual office and spends real credit. It is the
product; there is no flag that makes it simulate one.

```bash
git clone https://github.com/edycutjong/countercall.git && cd countercall
npm install

export CALLE_API_KEY=...          # Developer API key — the only credential needed
# Do NOT set COUNTERCALL_GOAL_ID: no Goal can be published (finding 5), and setting it
# routes to the Goals transport, which refuses with 409 goal_not_executable.

# 1. Verify the live contract before anything dials. Reads only, costs nothing.
node scripts/verify_live.mjs

# 2. See the exact request that would be sent. Still places no call.
node skills/countercall/scripts/call.mjs \
  --office ica-sg --procedure "passport renewal"

# 3. Dial. --live is required; it is never the default.
node skills/countercall/scripts/call.mjs \
  --office ica-sg --procedure "passport renewal" --live
```

**There is no `OFFLINE=1`, no `MOCK=`, no demo mode.** The default path prints the request and
stops, which is the opposite of a kill switch: you have to *ask* for the real thing, and when
you ask, you get the real thing.

### CI / deterministic replay — separate, and never the product

```bash
npm test                        # 274 tests, no credentials, no network
npm run bench -- --report       # recompute from recorded real calls
```

`bench --report` refuses to render a table from zero records and has no seeded mode. If it
prints numbers, calls happened.

## The receipt

Verbatim output of `npm run bench -- --report` over [`bench/records.json`](bench/records.json), 2026-09-13:

| Metric | Value |
|---|---|
| Real calls placed | 2 |
| Line answered | 1 (50%) |
| Usable validated checklist | 0 (0%) |
| p50 dial → validated checklist | — |
| p95 dial → validated checklist | — |
| Fastest / slowest | — / — |
| Measured | 2026-09-10 |

Latency is measured over the 0 calls that produced a
validated checklist. Calls that were never answered are excluded from the
latency figures and included in every count above.

**Every outcome, including the failures:**

| Outcome | Calls |
|---|---|
| `call_failed` | 1 |
| `result_unextractable` | 1 |

| Office | Calls | Usable |
|---|---|---|
| ica-sg | 1 | 0 |
| mom-sg | 1 | 0 |

Latency covers only the calls that produced a validated checklist — there are none yet, so
the p50/p95 rows are blank rather than estimated. The two records carry the `createdAt →
completedAt` span from `GET /v1/calls/{id}` as their duration (310.8s and 76.7s), because the
live runs were placed with `call.mjs`, not `bench.mjs`; the record says so in its `ms_source`.

**Answer rate is the project's largest open risk and is reported honestly.** Public service
lines go unanswered often. That is the premise of the skill, not a defect in it.

### Verified without spending a call credit

<!-- VERIFY:START -->

```text
CALL-E live contract verification
---------------------------------
  SDK                      @call-e/calle
  Places a call?           no — reads only, costs no call credit

  Authenticated            yes
  Round trip               845 ms
  Published Goals          0

The Goal catalogue is EMPTY, so the skill runs on the CALLS transport.

  Transport                calls — no published Goal required
  Contract                 request-scoped, pinned v2
  Schema fields            7 (6 required)
  additionalProperties     false
  Drift risk               none — schema is generated from the same CONTRACT that validates the reply

  CALL-E surfaces in this build
  ------------------------------------------------------------------
  [shared] exercised on every call
  Idempotency-Key              skills/countercall/scripts/_lib.mjs
                               one call per office, per procedure, per day — on both transports
  result contract              skills/countercall/scripts/contract.mjs
                               one pinned shape, validated locally whichever transport returned it
  failure codes                skills/countercall/scripts/render.mjs
                               every published code routed to a distinct, honest outcome

  [calls] ACTIVE — this is the live path
  calls.create                 skills/countercall/scripts/transport.mjs
                               places the call, carrying the contract as a request-scoped result_schema
  calls.waitForResult          skills/countercall/scripts/transport.mjs
                               polls to a terminal CallTask
  resultSchemaJSON()           skills/countercall/scripts/contract.mjs
                               emits the schema from CONTRACT, so sent and validated cannot diverge
  structuredResult             skills/countercall/scripts/transport.mjs
                               null on a connected call means unextractable, not empty — mapped to a terminal code

  [goals] implemented and tested, unreachable until a Goal is published
  goals.list                   scripts/verify_calle.mjs
                               discovers the published procedure catalogue
  goals.get                    skills/countercall/scripts/preflight.mjs
                               reads the live pinned contract before every dial
  goals.run                    skills/countercall/scripts/transport.mjs
                               places the call with a business-stable Idempotency-Key
  goals.waitForResult          skills/countercall/scripts/transport.mjs
                               polls to a validated result or a terminal error
  result_schema drift guard    skills/countercall/scripts/_lib.mjs
                               refuses the dial when the published contract moves

  Verified against the live service. No call was placed.

  Why the Goals path is dark: publishing a Goal exists only in CALL-E Chat —
  there is no POST /v1/goals, no MCP publish tool and no button on the Goal
  detail page. That gate is circular: publishing wants a passing simulation,
  the simulation wants concrete input values, and the harness refuses them.
  The code for that path ships and is tested; it has no Goal to target.
```

<!-- VERIFY:END -->

## One real call, start to finish

**Call 1 — ICA Singapore, `call_h9t6ZZJ_2kG_fxTJXlOQgw`, 2026-09-10.** `+65 6391 6100`, the
published general-enquiries line ([ica.gov.sg/contact-us](https://www.ica.gov.sg/contact-us)),
procedure *passport renewal*, Calls transport, `Idempotency-Key`
`countercall:ica-sg:passport-renewal:2026-09-10:v1`. Status `completed`, `structuredResult:
null`, 193 seconds. The full `transcript_turns` from `GET /v1/calls/{id}`, unedited:

```text
   0s  agent  Hello,
   0s  agent  I'm an automated assistant calling on behalf of a member of the public about what to bring for an in-person passport renewal visit.
   6s  ICA    Good afternoon. Thank you for calling Immigration and Checkpoints Authority.
   8s  agent  Thank you.
   8s  agent  May I know who's taking this call?
  10s  ICA    For English, press 1.
  26s  agent  Okay.
  32s  ICA    We did not receive your entry. For English, press 1.
  48s  agent  No rush.
  54s  ICA    We did not receive your entry. For English, press 1.
  64s  agent  No rush, I’ll hold.
  75s  ICA    You have exceeded the maximum number of tries. Please hold while we connect you to our next available officer.
  76s  agent  I'll hold.
 106s  ICA    Government officials will never ask you to transfer money or disclose bank login details over a phone call. Call the 24 7 ScamShield helpline at 1799 if you are unsure if something is a scam. Your call will be recorded for service quality and training purposes. The information you provide may be shared with other relevant agencies to facilitate the delivery of public services to you. You will be invited to rate the service
 108s  agent  I'll wait.
 124s  ICA    provided by our officer at the end of the call. For services for Singapore citizens, press 1. Permanent residents, press 2. Visit us, press 3. Other ICA services, press 4.
 131s  agent  Okay.
 150s  ICA    We did not receive your entry. For services for Singapore citizens, press 1. Permanent residents, press 2. Visit us, press 3. Other ICA services, press 4.
 157s  agent  I'll hold.
 176s  ICA    We did not receive your entry. For services for Singapore citizens, press 1. Permanent residents, press 2. Visit us, press 3. Other ICA services, press 4.
 178s  agent  No rush.
 184s  agent  I'm here.
 193s  ICA    Sorry. You have exceeded the maximum number of tries. Thank you for your call. Goodbye.
```

The agent announced itself at 0s, as the task requires. The line is a touch-tone menu, and
CALL-E cannot send DTMF, so every "press 1" was answered in words — nine times across two
menus — until the menu gave up. The API's own summary: *"The call reached ICA’s automated phone menu, but the goal was not completed. The assistant did not make the required keypad selections, so the call ended before reaching an officer or collecting passport-renewal information."*

What `call.mjs --live` printed for it, through the shipped normaliser and renderer:

```console
$ node skills/countercall/scripts/call.mjs --office ica-sg --procedure "passport renewal" --live
Dialling +6563916100 via the calls transport ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Immigration & Checkpoints Authority (ICA)
  passport renewal
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  NO CHECKLIST — result_unextractable

  The call connected, but nothing said on it answered the
  questions. Nothing is shown.

  No partial checklist is ever rendered.

  CALL-E run            call_h9t6ZZJ_2kG_fxTJXlOQgw
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Failed after 310.8s.
$ echo $?
5
```

**Call 2 — MOM Singapore, `call_Xpb-x1M9vaCSxPoJWAhpUQ`, 2026-09-10.** `+65 6438 5122`
([mom.gov.sg/contact-us](https://www.mom.gov.sg/contact-us)), *work pass renewal*. The
attempt failed at dial with SIP `486 Busy Here`; no transcript exists. Rendered:

```console
$ node skills/countercall/scripts/call.mjs --office mom-sg --procedure "work pass renewal" --live
Dialling +6564385122 via the calls transport ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Ministry of Manpower (MOM)
  work pass renewal
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  NO CHECKLIST — call_failed

  The call could not be completed.

  No partial checklist is ever rendered.

  CALL-E run            call_Xpb-x1M9vaCSxPoJWAhpUQ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Failed after 76.7s.
$ echo $?
5
```

Two real calls, zero checklists. That is the honest state of the receipt, and it is also the
finding: the lines a member of the public is told to call are IVR-gated, and an agent that
cannot press a key cannot reach the clerk. Filed as finding 7 in [FEEDBACK.md](FEEDBACK.md).

## What you can verify right now, with no credentials

These run today, on a clean checkout, and are what the gallery images were captured from.

**It refuses to dial a number it cannot source.** The test fixture carries an unsourced
number, so this is the real refusal path — with credentials present and `--live` asked for:

```console
$ node skills/countercall/scripts/call.mjs --offices test/fixtures/offices.test.json \
    --office fixture-unsourced --procedure "passport renewal" --live

REFUSING TO DIAL: no source_url — a number needs a published source; no source_checked date
$ echo $?
3
```

**The benchmark will not invent numbers.** With `bench/records.json` moved aside:

```console
$ npm run bench -- --report

No call records in bench/records.json.
Run `node scripts/bench.mjs --live --calls 20` first.
This script will not invent numbers.
$ echo $?
3
```

**The contract is verified across its whole input space.**

```console
$ npm test
      ↳ 1296 valid results verified
      ↳ 1296 rendered cards verified for invented values
      ↳ 8208 single-field corruptions, all rejected
      ↳ 720 unexpected-key injections, all rejected
# tests 274
# pass 274
```

That sweep found a real defect while it was being written: an empty `clerk_quote` validated
clean, which would have rendered a card that looks sourced and is not. It is pinned by a
regression test named after the defect.

## Honest limitations

1. **Goals are owner-scoped, and publishing one is chat-only.** There is no `POST /v1/goals`,
   no MCP publish tool and no action on the Goal detail page — all four surfaces are
   enumerated in [FEEDBACK.md](FEEDBACK.md) finding 5. The gate is circular: publishing
   requires a passing simulation, the simulation needs concrete values for the Goal's input
   variables, and the harness refuses concrete input values. **This is why the shipped default
   is the Calls transport**, which needs only an API key; the Goals transport ships fully
   tested and activates the moment a Goal can be published. What this repo contributes is the
   Goal *specification* plus the client, not a runnable shared Goal.
2. **A Goal Run result is a flat map of scalars** — no arrays, no nested objects, no nulls. The
   checklist travels as a newline-separated string decoded client-side, and the fee is an
   optional field that is simply absent when the clerk did not know. See
   [`contract.mjs`](skills/countercall/scripts/contract.mjs) and [FEEDBACK.md](FEEDBACK.md).
   The Calls API permits arrays; the scalar shape is kept on both transports on purpose, so
   there is one validator and one card rather than two of each.
3. **Coverage is bounded by the seed file.** CounterCall never infers a phone number — every
   office needs a human to have read the number off the office's own published page and
   recorded the date. That is a deliberate ceiling on growth, and it is the right one.
4. **A clerk's spoken answer is not legally binding**, and every card says so. Requirements
   change and individual counters apply discretion.
5. **Whether government lines answer an automated caller human-first is the project's largest
   open risk, and the first two real calls say no.** Measured by the benchmark and reported,
   failures included, rather than assumed. The fix is target selection — a line a person
   answers — or DTMF support on CALL-E's side.

## Links

- [README](README.md) · [JUDGE.md](JUDGE.md) · [FEEDBACK.md](FEEDBACK.md)
- Safety rules — [`references/safety.md`](skills/countercall/references/safety.md)
- The result contract — [`references/result-contract.md`](skills/countercall/references/result-contract.md)
