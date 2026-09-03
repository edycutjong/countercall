## Summary
<!-- What does this PR change and why? -->

## Changes
-

## Checklist
- [ ] `npm run ci` passes (lint, tests, audit)
- [ ] Tests added/updated for the change
- [ ] If this fixes a bug: a regression test in `test/regressions.test.mjs` **named after
      the defect**
- [ ] No test passes `--live` — nothing in this repo may make a phone ring in CI
- [ ] Docs / README updated if needed

## If this touches the seed file
- [ ] Every number is E.164 and carries `source_url` + `source_checked`
- [ ] I read each number off the office's own published page

## If this touches the result contract
- [ ] `CONTRACT.version` bumped and re-pinned against the published Goal
- [ ] Every field is a scalar — a Goal Run result cannot carry arrays, nested objects, or null
- [ ] The card still renders an em dash for anything the clerk did not give

## Related Issues
Closes #
