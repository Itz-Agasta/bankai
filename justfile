test:
    bun test

check:
    bunx oxlint && bunx oxfmt --write .

check-ci:
    bunx oxlint --deny-warnings && bunx oxfmt --check .

types:
    bunx tsc -b

validate-data dir:
    bun packages/core/scripts/validate-data.ts {{dir}}
