# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| latest (`main`) | ✅ |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities. Instead, report them
privately:

- Email **edy.cu@live.com**, or
- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  (Security → Report a vulnerability).

You'll get an acknowledgment within 48 hours and a resolution timeline after triage. Please
give us a reasonable window to patch before public disclosure.

## What counts as a vulnerability here

This project can cause a real phone to ring. Alongside the usual classes, we treat the
following as security issues:

- **Any path that dials a number without a published source**, or that bypasses the E.164
  and `source_checked` validation in `skills/countercall/scripts/_lib.mjs`.
- **Any path that renders a checklist from an unvalidated result.** A partial checklist that
  looks complete is the failure mode this project is built to prevent — someone may travel
  across a city on it.
- **Any path that mints a fresh idempotency key on retry**, defeating the one-call-per-
  office-per-procedure-per-day limit.
- **Any leak of `CALLE_API_KEY`** into logs, error messages, or committed files.
- **Personal data sent as a call variable.** The call is about a procedure, not a person.

These boundaries are asserted, not just documented — see `test/boundary.test.mjs`, which
drives the shipped entry points as subprocesses and attempts to make each of them dial
something it must refuse.

## Credential handling

`CALLE_API_KEY` and `COUNTERCALL_GOAL_ID` are read from the environment and are never
committed. `.env` and `.env.*` are gitignored; `.env.example` carries placeholders only.
CI runs TruffleHog and gitleaks over **full history** on every push, which is also the
pre-flight check before this repository is made public.
