# Feedback to the CALL-E team

Eight findings from building **CounterCall** — an Agent Skill that phones a government
enquiries line and returns a validated checklist of what to bring — against the Goals API and
the Calls API between 2026-08-19 and 2026-09-10.

Findings 1–5 were filed with the CALL-E Feedback Survey on 2026-09-06. **Findings 6, 7 and 8
were found on 2026-09-10 and are not yet filed** — the survey stays open until 2026-09-18, and
they are the most consequential three in the document: between them they ended this project's
original target country and forced a rebuild four days before the deadline.

Each one is a thing we hit while building, with the reproduction and the workaround we
shipped. Nothing here is a wishlist item; every entry cost us a design change.

<!-- FILING STATUS — FILED 2026-09-06
     CALL-E Feedback Survey: submitted 2026-09-06 via
       https://call-e.devpost.com/details/feedback
       (Google Form 1FAIpQLSfGWkt2F_ED6aLatQjtjBX8YEpBVQ47A39yeDd1KQRKX488Lg)
     Findings 1-5 went in the "bugs or issues" field, the two documentation-shaped
     ones also in the documentation field, and the what-worked section in "other feedback".
     FINDINGS 6, 7 AND 8 ARE NOT YET FILED - added 2026-09-10, refile before 2026-09-18.

     Submitted twice, both 2026-09-06, identical content. The first went through without a
     Google session, so no receipt was issued — the form's "Login ke Google" link embeds the
     entire pre-filled response in its continue= parameter, which at ~10KB exceeds Google's
     URL limit and returns HTTP 400. The second was filed from a fresh page signed in as
     edy.cu.tjong@gmail.com, which does produce a receipt. Same Devpost username and CALL-E
     email on both, so they dedupe to one entrant.

     Also posted to Discord #support, as the form requests:
       https://discord.com/channels/1493880186826133504/1546014799350206464

     Deadline was 2026-09-18 23:45 SGT. Filed 12 days early.
-->

---

## 1. A Goal Run result cannot carry an array, but a Call result can

**Severity: high — it changed our data model.**

From the OpenAPI spec, a Goal Run `result` is a flat map of scalars:

```yaml
GoalRun:
  result:
    type: [object, "null"]
    additionalProperties:
      $ref: "#/components/schemas/GoalScalar"    # string | number | boolean
```

Meanwhile the one-shot **Calls** API documents its request-scoped `result_schema` as
supporting *"`type`, `properties`, `required`, `enum`, nested `object` fields, simple
`array.items`, `description`, and `additionalProperties: false`"*.

So the same platform supports arrays and nested objects in one result surface and not the
other. That asymmetry is not stated anywhere we could find — we discovered it by reading the
generated types after our contract was already written.

**Why it mattered to us.** Our product *is* a list: the documents to bring. We specified
`required_documents: string[]`. It is not expressible on a Goal, so we ship it as a
newline-separated string and split it client-side:

```js
required_documents_text: "KTP asli\nFotokopi KTP\npaspor lama"
```

That works, but it pushes a delimiter convention into every consumer, and it moves a
validation the platform could do into code the platform cannot see. Two Goal authors solving
the same problem will pick different delimiters.

**Related:** `null` is not a `GoalScalar` either, so a nullable field is not expressible. We
worked around it by making the field **optional** — absence carries the meaning `null` had.
That happens to be cleaner, but it is a workaround we arrived at rather than a design the
docs pointed us to.

**What would have helped:** either array support in the Goal result schema profile, or one
explicit line in the Goals docs saying the profile is scalars-only and why — ideally beside
the Calls comparison, since the docs already position the two APIs against each other.

---

## 2. Goals cannot be created or shared through the API, which limits what a community repo can contain

**Severity: high — it changed the shape of our contribution.**

Goal authoring and publication are deliberately not Developer API operations, and Goals are
owner-scoped: cross-owner reads return `404`. There is no `POST /v1/goals` and no export or
import format.

We understand the safety reasoning. But `awesome-phone-call-agents` invites contributions in
the form of skills and plugins, and a Goal-native contribution **cannot be handed to anyone**.
The most useful artifact we can publish is prose: a description of a Goal that another
developer retypes into CALL-E Chat in their own account.

That is a real gap between what the contribution repo asks for and what the API allows.

**What would have helped:** an importable Goal manifest — even a read-only export of
`published_run_spec` plus the prompt, with a "create from manifest" path in Chat. That would
make a Goal-based contribution genuinely one-click, which is what the repo is for.

---

## 3. The TypeScript SDK camelCases a field the docs and the wire format spell in snake_case

**Severity: medium — it silently disabled a safety check.**

The docs, the OpenAPI spec, and the Python examples all use:

```json
{ "published_run_spec": { "input_schema": {...}, "result_schema": {...} } }
```

The TypeScript SDK exposes:

```ts
goal.publishedRunSpec.inputSchema
goal.publishedRunSpec.resultSchema
```

The camelCasing is reasonable and consistent with the rest of the TS surface. The problem is
that reading the documented name against the TS client returns `undefined` rather than
throwing.

**Why it mattered to us.** We built a contract-drift guard that reads the live
`published_run_spec` before every dial and refuses to call if the schema has moved. Written
against the documented field name, it silently read `undefined`, concluded "no published
spec", and **refused every single dial** — while looking like it was working. It was caught
only when we wrote a test that fed it both shapes.

A safety check that fails closed is the good case; one that fails closed *for the wrong
reason* hides a real bug behind a plausible message.

**What would have helped:** a note in the TS SDK docs that the client camelCases the wire
format, or a runtime warning on a known-snake_case access. The SDK reference page shows
camelCase in its examples, but the Goals guide — which is where you go to learn the shape —
shows the JSON.

---

## 4. Issue #106 was closed without a changelog entry, and we could not tell whether to trust it

**Severity: low — process, not product.**

`credential_grant_unavailable` (GitHub issue #106) made Goal Runs return `201` and then fail
about thirty seconds later before any call was placed. It was acknowledged by staff on Devpost
forum thread 44713 on 2026-08-07 and closed on 2026-08-17 with the comment "issue has been
fixed", by a contributor rather than a maintainer, with **no corresponding changelog entry** —
the published changelog's latest entries were 2026-08-11 and 2026-08-15.

For a hackathon participant with a Goals-native project, that is the difference between
"build on this" and "build a fallback". We could not tell from the outside whether the fix had
shipped, and the acknowledged scope covered only the Goal Run path — separate `POST /v1/calls`
failures reported in the same thread were never explained.

**What would have helped:** a changelog line for any fix to a documented failure mode, even a
one-liner. During a hackathon it is load-bearing information.

---

## 5. Publishing a Goal is chat-only, and the chat has an LLM quota that blocks shipping

**Severity: high — it is a hard block with no fallback.** Added 2026-09-06, after the survey was
filed. This is finding 2 in its complete form, with every surface now enumerated rather than
inferred from the docs.

A Goal can only be published by the conversational agent in CALL-E Chat. We checked all four
places a publish action could live:

| surface | can it publish? |
|---|---|
| Developer API | No. Eight operations exist and Goals are read-or-run only: `GET /v1/goals`, `GET /v1/goals/{id}`, `POST /v1/goals/{id}/runs`, `GET .../runs/{id}`. There is no `POST /v1/goals`. |
| MCP | No. The authorized CLI lists four tools: `plan_call`, `run_call`, `get_call_run`, `track_ui_events`. |
| Goal detail page | No action. It only says "This Goal is a draft. Publish it before running these examples." |
| Goal card `⋯` menu | **Edit and Delete only.** |

So publication is reachable exclusively through an LLM-backed agent — and that agent returns

> This account has reached its LLM usage limit. Please try again after the quota window resets.

on every turn, including the first prompt of a fresh session. Our account balance was **$10.95**
with **$0.05 of lifetime usage** at the time, so this is not a credit problem. The Goal
(`goal_6mi7m565agdr`) was created, a run spec was generated and reported `status: active`, and
it is still stuck in Draft. `goals.get` returns `409 goal_not_executable`.

The consequence is that a rate limit on a chat product becomes a hard block on shipping, with
no API, no CLI and no UI path around it. For a hackathon entrant that is the difference between
submitting and not.

Reported to CALL-E 2026-09-06 in Discord #support:
<https://discord.com/channels/1493880186826133504/1546038380448579624>
(the first four findings are at
<https://discord.com/channels/1493880186826133504/1546014799350206464>)

Also raised by email to support@heycall-e.com on 2026-09-06. CALL-E replied on 2026-09-07,
confirmed the block and logged it as
[awesome-phone-call-agents#343](https://github.com/CALLE-AI/awesome-phone-call-agents/issues/343),
stating they had "no confirmed reset window or publication exemption to share". It is still
open. Account sign-in, which was separately suspended on 2026-09-02, was working again on
2026-09-08 — the quota block is independent of it, and outlasted it.

**Update, 2026-09-08 evening: the quota lifted, and that is worth reporting as precisely as
the block was.** Chat accepted prompts again and worked for over thirteen minutes on the Goal
revision. So the limit is a window, not a permanent ceiling on this account — but no window
was ever communicated, by the product or by support, which is the part that made it
unplannable. Two days were spent building around a block that expired without notice. A
visible quota meter and a reset time would have cost us nothing to wait for; an invisible one
cost us the architecture. The Goal is still unpublished, now for an unrelated reason: the
publishing agent gates publication behind a simulation it could not complete.

**The publish gate is circular, and that is the finding that outlives the quota.** Traced on
2026-09-08 between 18:09 and 19:42 WIB. Publication requires a passing simulation. A simulation
can only be assessed with concrete values for the Goal's declared input variables — the agent
said so itself, reporting "0 of 1 mandatory scenario can be validly assessed because procedure,
office and city values are unavailable". We supplied them. The next run failed at `Sending
input`, and the agent had already explained why: "simulasi kandidat yang tersedia tidak menerima
nilai input konkret" — the available candidate simulation does not accept concrete input values.
So the gate requires evidence the harness is structurally unable to produce, and a Goal with
required input variables cannot pass it at all.

Two smaller things fell out of the same session, both cheap to fix:

- The run reported `Running · 88 min 30s` in the header while three of its steps had already
  failed — `Updating call plan`, `Sending input`, `Running`. The failures were only visible
  after expanding the step list, and the prose below the spinner was a stale copy of a question
  already answered. There is no timeout, no terminal state and no cancel; the two preceding
  turns had finished in 2m13s and 1m33s, so nothing on screen distinguished 88 minutes of work
  from 88 minutes of nothing.
- The draft's stored candidate schema shared **zero field names** with the schema we had
  authored earlier in the same Goal (`documents_to_bring` vs `required_documents_text`,
  `total_fee` vs `total_fee_idr`, `payment_methods` vs `payment_method`, and so on), and had
  silently dropped the two evidence fields. The conflict surfaced as a two-button dialog naming
  neither schema, so either button could have published a contract our client would refuse to
  dial against. Showing a diff, or the field lists, would make that choice safe.

**What would help,** in order of cost: expose publication as a plain UI action on the Goal
detail page — it needs no language model, only a state change; or exempt Goal publication from
the chat LLM quota; or add `POST /v1/goals` and let the API do it.

## 6. Indonesia, Malaysia and the Philippines are refused, while the docs still list them as supported

**Severity: high — it invalidates a documented capability that projects are built on.** Found
2026-09-10.

Every call to an Indonesian number is now refused before dialling, in *both* languages. We
probed with `plan_call`, which never dials, so each of these cost nothing and rang nobody:

| target | region + language | result |
|---|---|---|
| `+622179170915` (Imigrasi Jakarta Selatan) | ID + Bahasa | refused — *"kombinasi wilayah ID dan Bahasa belum didukung"* |
| `+622179170915` | ID + **English** | refused — *"recognized as Indonesia / English, which is not currently supported"* |
| `+60380008000` (Jabatan Imigresen Malaysia) | MY + English | refused — *"the recognized destination is Malaysia and the call language is English … isn't supported right now"* |
| `+63284652400` (PH Bureau of Immigration) | PH + English | refused — *"calls to the Philippines in English are not currently supported"* |
| `+6563916100` (ICA Singapore) | SG + English | **`ready_to_run: true`** |

The published capability summary we crawled on 2026-07-29 lists **US, SG, MY, IN, AE, AU, CA,
GB, VN, DE, JP, FR, MX, BR, ID, PH, KE** as supported regions, with Indonesia annotated
*"ID / Indonesia (English)"*. Three of those — ID, MY, PH — are refused today. The allow-list
the API offered back in the refusal was `US|English`, `US|Bahasa`, `SG|English`, `AU|English`,
`IN|English`.

Two things would have saved us a rebuild four days before a deadline:

1. **A machine-readable, live list of supported region + language pairs.** There is no endpoint
   for this. We discovered the contraction by being refused at dial time, on the day we needed
   the call. A `GET /v1/regions` would have let our preflight fail in July instead of September.
2. **A changelog entry.** This is the same gap as finding 4. A region leaving the supported set
   is a breaking change for every project targeting it, and it was silent.

Worth noting, because it cost us a wrong turn: the recommendation given for the degraded shared
pool was to buy a US or Brazil number. That does not help here — the block is evaluated on the
**recipient's** region, so a US caller ID still cannot reach `+62`.

---

## 7. The agent cannot send DTMF tones, so any IVR-gated line is unreachable

**Severity: high — it is the difference between reaching an institution and not.** Found
2026-09-10, call `call_h9t6ZZJ_2kG_fxTJXlOQgw`, 193 seconds, status `completed`,
`structured_result: null`.

We called ICA Singapore's published main line. It answered, and then asked the agent to press a
key. The agent replied in words — nine turns across two menus in the full transcript; abridged here — and was hung up on:

```
  6s  callee  Good afternoon. Thank you for calling Immigration and Checkpoints Authority.
 10s  callee  For English, press 1.
 26s  agent   Okay.
 32s  callee  We did not receive your entry. For English, press 1.
 48s  agent   No rush.
 54s  callee  We did not receive your entry. For English, press 1.
 64s  agent   No rush, I'll hold.
 75s  callee  You have exceeded the maximum number of tries. Please hold while we connect
              you to our next available officer.
124s  callee  For services for Singapore citizens, press 1. Permanent residents, press 2.
              Visit us, press 3. Other ICA services, press 4.
131s  agent   Okay.
150s  callee  We did not receive your entry. [menu repeats]
193s  callee  You have exceeded the maximum number of tries. Thank you for your call. Goodbye.
```

The agent's own summary is accurate: *"The call reached ICA's automated phone menu, but the goal
was not completed. The assistant did not make the required keypad selections."*

`dtmf`, `keypad` and `tone` do not appear anywhere in the OpenAPI specification or in any page
of the developer documentation. There is no request parameter to enable it and no task-language
instruction that reaches it — the model is answering the menu conversationally because speech is
the only channel it has.

This matters more than a missing convenience. The stated use case is calling businesses and
institutions, and a main line is *exactly* the kind of number that sits behind a menu. As it
stands, the platform can reach a person who picks up directly, and cannot reach any organisation
large enough to have a switchboard. We would rank this above every other item in this document:
support for sending digits, even a simple `dtmf` action the model can emit mid-call, would open
up the entire category.

---

## 8. `completion_confidence` reported `high` on a call that achieved nothing

**Severity: medium — it makes the field unusable as a success signal.** Same call as finding 7.

That 193-second call reached a menu, failed to key through it, was disconnected, and
returned no structured result at all. The task response carried:

```json
"completion_confidence": { "score": 0.9, "label": "high" }
```

We read `completion_confidence` as *"how confident are you that the task was accomplished"*, and
recorded it per call for our benchmark. On that reading, 0.9 on this transcript is plainly wrong.
If instead it means *"how confident am I that the call reached a terminal state"* or *"how
clean was the audio"*, then the name is the problem and the docs do not disambiguate it.

Either way the practical consequence is the same: a caller cannot use this field to decide
whether to retry, which is the obvious thing to want it for. We now gate entirely on
`structured_result` being non-null and on our own schema validation, and we do not surface this
number to users.

---

## What we would say about the parts that worked

The pinned `published_run_spec` with `additionalProperties: false` is the single best thing
about this API for our use case, and it is why the project is Goals-native rather than
Calls-native. Being able to say *the schema the agent spoke against is provably the schema the
result was validated by* is what let us treat abstention as a first-class outcome instead of a
parsing failure. The required `Idempotency-Key` on Goal Runs is the right call and should not
be made optional — we scoped ours to office + procedure + date, and it is what makes retrying
safe against a public phone line staffed by a real person.

`GoalRunError` having a small closed set of codes with a separate `detail_code` is also
correct, and we route all eight to distinct user-facing outcomes.

---

*CounterCall · built for the CALL-E Hackathon 2026 · [JUDGE.md](JUDGE.md) · [README](README.md)*
