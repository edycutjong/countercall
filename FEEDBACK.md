# Feedback to the CALL-E team

Four findings from building **CounterCall** — an Agent Skill that phones an Indonesian
government counter and returns a validated checklist of what to bring — against the Goals API
between 2026-08-19 and 2026-09-03.

Each one is a thing we hit while building, with the reproduction and the workaround we
shipped. Nothing here is a wishlist item; every entry cost us a design change.

<!-- FILING STATUS
     Filed: <FEEDBACK_FILING_URL>
     Venue: Discord #feature-requests and/or the CALL-E Feedback Survey
     Deadline: the Feedback Period closes 2026-09-18 23:45 SGT, four days after the
     project submission deadline. An unfiled FEEDBACK.md is worth nothing to anyone.
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
