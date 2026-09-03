.PHONY: help install lint lint-fix test coverage ci audit security-scan bench plan verify clean

help:
	@echo "CounterCall — make targets"
	@echo ""
	@echo "  install         npm ci"
	@echo "  lint            eslint"
	@echo "  lint-fix        eslint --fix"
	@echo "  test            full suite (210 tests, no credentials needed)"
	@echo "  coverage        test suite with coverage"
	@echo "  audit           npm audit (high+critical)"
	@echo "  security-scan   npm audit + license check + gitleaks over full history"
	@echo "  ci              lint + test + audit"
	@echo ""
	@echo "  plan            print the benchmark call plan — dials nothing"
	@echo "  bench           report from bench/records.json (refuses if empty)"
	@echo "  verify          live CALL-E read — needs CALLE_API_KEY, places no call"
	@echo ""
	@echo "  Nothing in this Makefile places a phone call. Dialling requires"
	@echo "  scripts/call.mjs --live with both CALLE_API_KEY and COUNTERCALL_GOAL_ID."

install:
	npm ci

# ── Code Quality ────────────────────────────────────────────
lint:
	@echo "🔍 eslint..."
	npm run lint

lint-fix:
	npm run lint:fix

test:
	@echo "🧪 test suite..."
	npm test

coverage:
	npm run test:coverage

# ── Security ────────────────────────────────────────────────
audit:
	npm audit --audit-level=high || true

security-scan:
	@echo "=== NPM AUDIT ==="
	npm audit --audit-level=high || true
	@echo ""
	@echo "=== LICENSE CHECK ==="
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true
	@echo ""
	@echo "=== GITLEAKS (full history — run this before the public flip) ==="
	@command -v gitleaks >/dev/null 2>&1 \
		&& gitleaks detect --no-banner --redact \
		|| echo "gitleaks not installed locally — CI runs it on every push (.github/workflows/gitleaks.yml)"

ci: lint test audit

# ── CALL-E ──────────────────────────────────────────────────
plan:
	node scripts/bench.mjs --plan --calls 20

bench:
	node scripts/bench.mjs --report

verify:
	npm run verify

clean:
	rm -rf coverage .nyc_output
