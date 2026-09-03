# Contributing

Thanks for your interest in improving CounterCall! 🎉

The most useful contribution is **an office**: a published enquiries line for a public
service counter in your city, with the URL you read it off and the date you checked it.
See "Adding an office" below — it has rules, and they are not negotiable.

## Getting started

```bash
git clone https://github.com/OWNER/REPO.git && cd countercall
npm install
npm test              # 210 tests, no credentials required
```

To exercise the CALL-E integration without placing a call:

```bash
cp .env.example .env          # CALLE_API_KEY unlocks the live read tests
npm run bench -- --plan       # prints the call plan, dials nothing
```

## Before you open a PR

- `npm run ci` passes (lint, tests, audit).
- Add or update tests for any behavior change.
- If you fixed a bug, add a regression test in `test/regressions.test.mjs` **named after
  the defect**, not after the expectation. That file is meant to read as a changelog.
- Keep commits conventional (`feat:`, `fix:`, `docs:`, `chore:`) — `release.yml` derives
  the version from them.

## Adding an office

This project points an automated caller at a phone line staffed by a public servant who
did not opt in. Read [`skills/countercall/references/safety.md`](../skills/countercall/references/safety.md)
in full before adding one. In short:

- **Never infer a number.** It goes in the seed file only when a human has read it off the
  office's *own* published page, and recorded `source_url` and `source_checked`.
- General-enquiries lines only. Never a staff member's personal mobile, never an emergency,
  medical, or crisis line.
- Check that automated calling is lawful in that jurisdiction before adding it.
- CI enforces the mechanical half of this: a number that is not E.164, or carries no source
  and check date, is refused before the dialler sees it.

## What will not be merged

- A number without a published source.
- A scraped or pattern-guessed number.
- Any change that lets a partial or inferred checklist reach a user. Abstention is a correct
  output here; a plausible guess is not.
- A test that passes `--live`. No test in this repo may cause a phone to ring.

## Reporting bugs / requesting features

Open an issue using the provided templates. Include repro steps, expected vs. actual
behavior, and environment details. For anything security-related, see
[SECURITY.md](SECURITY.md) instead — do not open a public issue.
