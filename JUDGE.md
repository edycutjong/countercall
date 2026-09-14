# For judges

Everything you need in one page. No setup, no keys, no clone required to read it.

## The claim

**Before you lose a morning at a government counter, CALL-E phones the office for you and
hands back exactly what to bring — the document checklist, the fee, cash-or-card, and whether
you need an appointment first — and leaves the row empty when the clerk did not know.**

What it has actually done so far, on the record: **two real calls to two Singapore agencies,
zero checklists.** ICA's line is a touch-tone menu and CALL-E cannot send DTMF; MOM's line was
busy. Both calls, their ids and their full transcripts are in [`DEMO.md`](DEMO.md), the
rendered "no checklist" outcomes are what the shipped code printed, and the DTMF gap is filed
back to CALL-E as [finding 7](FEEDBACK.md). We are showing you the wall, with the receipt,
rather than a call that did not happen.

## The 30-second path

1. Read one real call, start to finish, in [`DEMO.md`](DEMO.md): the request, the
   unedited `transcript_turns` from `GET /v1/calls/call_h9t6ZZJ_2kG_fxTJXlOQgw`, and what
   `call.mjs` rendered for it — `NO CHECKLIST — result_unextractable`, not a partial card.
2. Watch the demo video — <https://youtu.be/A3g0GWmx4wY> — 2:03. The call beat is that
   transcript revealed at its real offsets, with the call id on screen; CALL-E exposes no
   audio recording, so text is the honest form.
3. Skim [`skills/countercall/references/safety.md`](skills/countercall/references/safety.md).
   It is the part of this project we most want read: it governs pointing an automated
   caller at a public servant who did not opt in.

To run it yourself, no credentials needed:

```bash
npm install && npm test        # 274 tests
npm run bench -- --plan        # prints the call plan; dials nothing
```

## The receipt

Verifiable numbers only. Anything not yet measured is marked as such rather than estimated.

| | |
|---|---|
| Tests | **274**, passing, no credentials required |
| Contract cases exhaustively verified | **11,520** (see below) |
| CALL-E `GoalRunError` codes routed | **8 of 8** in the published schema |
| Live CALL-E integration tests | **7** — real API reads, skipped loudly without a key |
| Runtime dependencies | **1** (`@call-e/calle`) |

| Real calls placed to real offices | **2** (2026-09-10) |
| Line answered | **1** (50%) — ICA's IVR; MOM was busy |
| Usable validated checklist | **0** (0%) |
| p50 / p95 dial → validated checklist | — / — (no checklist yet; blank, not estimated) |
| CALL-E call ids | `call_h9t6ZZJ_2kG_fxTJXlOQgw`, `call_Xpb-x1M9vaCSxPoJWAhpUQ` |

Produced by `npm run bench -- --report` over [`bench/records.json`](bench/records.json); the
full table, failures included, is in [`DEMO.md`](DEMO.md#the-receipt).

### Where 11,520 comes from

`validateResult` + `renderCard` are the decision function that must never be wrong —
everything downstream is a person deciding whether to travel across a city. Rather than
test them on examples, [`test/exhaustive.test.mjs`](test/exhaustive.test.mjs) walks the
entire input space the contract permits:

| Sweep | Cases |
|---|---|
| Every contract-satisfying result validates clean | 1,296 |
| No rendered card contains a value the clerk did not give | 1,296 |
| Every single-field corruption is rejected | 8,208 |
| Every unexpected-key injection is rejected | 720 |
| **Total** | **11,520** |

This sweep found a real defect while being written: an empty `clerk_quote` validated clean,
which would have rendered a card that looks sourced and is not. Fixed, and pinned by a
regression test.

## Reproduce

First, with **no credentials at all** — this prints the exact request that would be sent,
including the full result schema, and stops:

```bash
node skills/countercall/scripts/preflight.mjs \
  --office ica-sg --procedure "passport renewal"
node skills/countercall/scripts/call.mjs \
  --office ica-sg --procedure "passport renewal"
```

With a key, still placing no call — this reads the live service and reports which transport
is active and why:

```bash
export CALLE_API_KEY=...          # Developer API key
node scripts/verify_live.mjs
```

The real path — this places an actual phone call and spends real credit. **One export, no
Goal required:**

```bash
export CALLE_API_KEY=...          # Developer API key — this is the only one needed
node skills/countercall/scripts/call.mjs \
  --office ica-sg --procedure "passport renewal" --live
```

That runs the **Calls transport**, which carries the contract with the request. If you have
published a Goal of your own, `export COUNTERCALL_GOAL_ID=...` and the same command runs the
**Goals transport** against it instead — same card, same validation. `--transport goals|calls`
forces either one.

> Singapore agency lines answer roughly **Mon–Fri 08:00–17:00 SGT (UTC+8)**. Outside those
> hours the honest outcome is `no_answer`; inside them, ICA's line is an IVR that CALL-E cannot
> navigate, so expect `result_unextractable` — and that is what you will see. The tool has no
> simulated mode to fall back on. CALL-E currently refuses Indonesian, Malaysian and
> Philippine numbers ([finding 6](FEEDBACK.md)), which is why the seed file is Singapore.

Note the `--live` flag. It is **required to dial** — the default path prints the exact
request and stops. That is the opposite of a demo mode: there is no flag that makes this
project *simulate* a call, and no mocked or replayed provider anywhere in the tree.

**CI / deterministic replay** (separate, and never the product):
`npm test` runs 274 tests with no credentials. `npm run bench -- --report` recomputes the
benchmark from recorded real calls; it refuses to render a table from zero records and has
no seeded mode.

## Honest limitations

1. **Goals are owner-scoped, and publishing one is chat-only.** A Goal is authored and
   published in CALL-E Chat — there is no `POST /v1/goals`, no MCP publish tool and no action
   on the Goal detail page (all four surfaces are enumerated in [`FEEDBACK.md`](FEEDBACK.md)
   finding 5). That path is circular rather than merely slow: publication requires a passing
   simulation, the simulation can only be assessed with concrete values for the Goal's input
   variables, and the harness refuses concrete input values — so a Goal that declares input
   variables cannot pass its own publish gate. **This is why the default transport is the Calls API**: it needs
   only a key, so the demo above works for you today. The Goals transport ships fully tested
   and activates the moment a Goal can be published. What this repo contributes to the
   community is the Goal *specification* plus the client, not a runnable shared Goal.
2. **A Goal Run result is a flat map of scalars** — no arrays, no nested objects, no nulls.
   The document checklist therefore travels as a newline-separated string and is decoded
   client-side, and the fee is an optional field that is simply absent when the clerk did
   not know. This is a real constraint we designed around, documented in
   [`contract.mjs`](skills/countercall/scripts/contract.mjs). The Calls API *does* permit
   arrays; we deliberately keep the scalar shape on both transports, because two result
   shapes would mean two validators and a card that could render correctly on one path and
   wrongly on the other.
3. **Coverage is only as good as the seed file.** CounterCall never infers a phone number —
   every office requires a human to have read the number off the office's own published
   page and recorded the URL and date. That is a deliberate ceiling on growth, and it is the
   right one.
4. **A clerk's spoken answer is not legally binding**, and every card says so. Requirements
   change and individual counters apply discretion.
5. **Whether government lines answer an automated caller human-first is the project's
   largest open risk — and so far the answer is no.** Two of two real calls reached no clerk:
   one IVR CALL-E cannot key through, one busy line. It is measured by the benchmark and
   reported honestly, failures included — not assumed. The fix is target selection (a line a
   person answers), or DTMF support on CALL-E's side.

## Links

- Repo — <https://github.com/edycutjong/countercall>
- Demo video — <https://youtu.be/A3g0GWmx4wY>
- Devpost — https://call-e.devpost.com/
- The Agent Skill package — [`skills/countercall/`](skills/countercall/)
- Safety rules — [`references/safety.md`](skills/countercall/references/safety.md)
- The result contract — [`references/result-contract.md`](skills/countercall/references/result-contract.md)
