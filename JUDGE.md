<!--
  PENDING before submission — resolve every marker in this file:
  1. The receipt block: real call count, answer rate, p50/p95, run ids.
     Produce with `npm run bench -- --live --calls 20`, then `npm run bench -- --report`.
  2. Demo video URL and repo URL.
  3. The 30-second path assumes the Goal is published — confirm the ids.
-->

# For judges

Everything you need in one page. No setup, no keys, no clone required to read it.

## The claim

**Before you lose a morning at an Indonesian government counter, CALL-E phones the office
for you, survives the IVR and the hold, and hands back exactly what to bring — the document
checklist, the fee, cash-or-card, and whether you need an appointment first.**

## The 30-second path

1. Read one real call's output: the checklist card in [`DEMO.md`](DEMO.md), with the
   clerk's verbatim line and the CALL-E `runId` you can cross-reference.
2. Watch the demo video — <!-- PENDING: video URL --> — one real call, start to finish,
   with the handset audible.
3. Skim [`skills/countercall/references/safety.md`](skills/countercall/references/safety.md).
   It is the part of this project we most want read: it governs pointing an automated
   caller at a public servant who did not opt in.

To run it yourself, no credentials needed:

```bash
npm install && npm test        # 234 tests
npm run bench -- --plan        # prints the call plan; dials nothing
```

## The receipt

Verifiable numbers only. Anything not yet measured is marked as such rather than estimated.

| | |
|---|---|
| Tests | **234**, passing, no credentials required |
| Contract cases exhaustively verified | **11,520** (see below) |
| CALL-E `GoalRunError` codes routed | **8 of 8** in the published schema |
| Live CALL-E integration tests | **7** — real API reads, skipped loudly without a key |
| Runtime dependencies | **1** (`@call-e/calle`) |

<!-- PENDING — fill from `npm run bench -- --report` after the live bench:
| Real calls placed to real offices | N |
| Line answered | N (X%) |
| Usable validated checklist | N (X%) |
| p50 / p95 dial → validated checklist | Xs / Xs |
| CALL-E run ids | grun_..., grun_... |
-->

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

The real path — this places actual phone calls and spends real credit:

```bash
export CALLE_API_KEY=...          # Developer API key
export COUNTERCALL_GOAL_ID=...    # the published Goal
node skills/countercall/scripts/call.mjs \
  --office imigrasi-jaksel --procedure "perpanjangan paspor" --live
```

Note the `--live` flag. It is **required to dial** — the default path prints the exact
request and stops. That is the opposite of a demo mode: there is no flag that makes this
project *simulate* a call, and no mocked or replayed provider anywhere in the tree.

**CI / deterministic replay** (separate, and never the product):
`npm test` runs 234 tests with no credentials. `npm run bench -- --report` recomputes the
benchmark from recorded real calls; it refuses to render a table from zero records and has
no seeded mode.

## Honest limitations

1. **Goals are owner-scoped.** They are authored and published in CALL-E Chat, not through
   the Developer API. So what this repo contributes to the community is the Goal
   *specification* plus the client — not a runnable shared Goal you can execute against our
   account. Publishing your own copy takes about two minutes.
2. **A Goal Run result is a flat map of scalars** — no arrays, no nested objects, no nulls.
   The document checklist therefore travels as a newline-separated string and is decoded
   client-side, and the fee is an optional field that is simply absent when the clerk did
   not know. This is a real constraint we designed around, documented in
   [`contract.mjs`](skills/countercall/scripts/contract.mjs).
3. **Coverage is only as good as the seed file.** CounterCall never infers a phone number —
   every office requires a human to have read the number off the office's own published
   page and recorded the URL and date. That is a deliberate ceiling on growth, and it is the
   right one.
4. **A clerk's spoken answer is not legally binding**, and every card says so. Requirements
   change and individual counters apply discretion.
5. **Whether Indonesian government lines reliably answer an automated caller is the
   project's largest open risk.** It is measured by the benchmark and reported honestly,
   failures included — not assumed.

## Links

- Repo — <!-- PENDING: repo URL -->
- Demo video — <!-- PENDING: video URL -->
- Devpost — https://call-e.devpost.com/
- The Agent Skill package — [`skills/countercall/`](skills/countercall/)
- Safety rules — [`references/safety.md`](skills/countercall/references/safety.md)
- The result contract — [`references/result-contract.md`](skills/countercall/references/result-contract.md)
