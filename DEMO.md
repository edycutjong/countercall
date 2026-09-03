<!--
  PENDING — this file has three holes that only a real call can fill:
    1. The receipt table            → `npm run bench -- --report`
    2. The verification block       → `node scripts/verify_live.mjs --write`
    3. The transcript of one call   → paste from a real run, with the runId

  Everything else here is true today and needs no edit. The holes are marked with
  PENDING and are greppable; none of them may be filled with an estimate.
-->

# DEMO

What this project does, how to see it for yourself, and the numbers behind the claims.

For the 30-second version, read [JUDGE.md](JUDGE.md).

---

## The claim

**CounterCall places one real CALL-E phone call to an Indonesian government service counter,
survives the IVR and the hold, and returns a validated checklist of what to bring — and leaves
a field empty when the clerk did not know it.**

## Reproduce it — the real path

This places an actual phone call to an actual office and spends real credit. It is the
product; there is no flag that makes it simulate one.

```bash
git clone <REPO_URL> && cd countercall
npm install

export CALLE_API_KEY=...          # Developer API key
export COUNTERCALL_GOAL_ID=...    # the Goal published in CALL-E Chat

# 1. Verify the live contract before anything dials. Reads only, costs nothing.
node scripts/verify_live.mjs

# 2. See the exact request that would be sent. Still places no call.
node skills/countercall/scripts/call.mjs \
  --office imigrasi-jaksel --procedure "perpanjangan paspor"

# 3. Dial. --live is required; it is never the default.
node skills/countercall/scripts/call.mjs \
  --office imigrasi-jaksel --procedure "perpanjangan paspor" --live
```

**There is no `OFFLINE=1`, no `MOCK=`, no demo mode.** The default path prints the request and
stops, which is the opposite of a kill switch: you have to *ask* for the real thing, and when
you ask, you get the real thing.

### CI / deterministic replay — separate, and never the product

```bash
npm test                        # 232 tests, no credentials, no network
npm run bench -- --report       # recompute from recorded real calls
```

`bench --report` refuses to render a table from zero records and has no seeded mode. If it
prints numbers, calls happened.

## The receipt

<!-- PENDING: fill from `npm run bench -- --report`. Every row must come from real calls.
     bench_stats.toMarkdown throws on an empty record set, by design, so there is no way to
     generate this table without having placed the calls. -->

| Metric | Value |
|---|---|
| Real calls placed | `<CALL_COUNT>` |
| Line answered | `<ANSWERED>` (`<ANSWER_RATE>`%) |
| Usable validated checklist | `<USABLE>` (`<USABLE_RATE>`%) |
| p50 dial → validated checklist | `<P50>`s |
| p95 dial → validated checklist | `<P95>`s |
| Measured | `<MEASURED_AT>` |

Latency covers only the calls that produced a validated checklist. Calls that were never
answered are excluded from the latency figures and included in every count. The full outcome
breakdown, failures included, is printed by the same command.

**Answer rate is the project's largest open risk and is reported honestly.** Public service
lines go unanswered often. That is the premise of the skill, not a defect in it.

### Verified without spending a call credit

<!-- VERIFY:START -->

*Not yet run. `node scripts/verify_live.mjs --write` fills this block with the real output —
the published Goal, its RunSpec version, and the drift check against the pinned contract.*

<!-- VERIFY:END -->

## One real call, start to finish

<!-- PENDING: paste a real transcript here — the request, the outcome, and the rendered card,
     with the CALL-E runId so it can be cross-referenced against the dashboard screenshot and
     the demo video. If the first real call is a no_answer, publish THAT. The honest failure
     is worth more than a retry until it looks good. -->

`<REAL_CALL_TRANSCRIPT>`

## What you can verify right now, with no credentials

These run today, on a clean checkout, and are what the gallery images were captured from.

**It refuses to dial a number it cannot source.** The shipped seed file still carries a
placeholder, so this is the real refusal path — with credentials present and `--live` asked
for:

```console
$ node skills/countercall/scripts/call.mjs --office imigrasi-jaksel \
    --procedure "perpanjangan paspor" --live

REFUSING TO DIAL: not E.164: +62XXXXXXXXXX; no source_checked date; placeholder number
$ echo $?
3
```

**The benchmark will not invent numbers.**

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
# tests 232
# pass 232
```

That sweep found a real defect while it was being written: an empty `clerk_quote` validated
clean, which would have rendered a card that looks sourced and is not. It is pinned by a
regression test named after the defect.

## Honest limitations

1. **Goals are owner-scoped.** They are authored and published in CALL-E Chat, not through the
   Developer API, so what this repo contributes is the Goal *specification* plus the client —
   not a runnable shared Goal you can execute against our account.
2. **A Goal Run result is a flat map of scalars** — no arrays, no nested objects, no nulls. The
   checklist travels as a newline-separated string decoded client-side, and the fee is an
   optional field that is simply absent when the clerk did not know. See
   [`contract.mjs`](skills/countercall/scripts/contract.mjs) and [FEEDBACK.md](FEEDBACK.md).
3. **Coverage is bounded by the seed file.** CounterCall never infers a phone number — every
   office needs a human to have read the number off the office's own published page and
   recorded the date. That is a deliberate ceiling on growth, and it is the right one.
4. **A clerk's spoken answer is not legally binding**, and every card says so. Requirements
   change and individual counters apply discretion.
5. **Whether Indonesian government lines reliably answer an automated caller is unproven.** It
   is the project's largest open risk, measured by the benchmark rather than assumed.

## Links

- [README](README.md) · [JUDGE.md](JUDGE.md) · [FEEDBACK.md](FEEDBACK.md)
- Safety rules — [`references/safety.md`](skills/countercall/references/safety.md)
- The result contract — [`references/result-contract.md`](skills/countercall/references/result-contract.md)
