test:
    bun test

check:
    bunx oxlint && bunx oxfmt --write . && bunx knip

check-ci:
    bunx oxlint --deny-warnings && bunx oxfmt --check . && bunx knip

knip:
    bunx knip

types:
    bunx tsc -b

validate-data dir:
    bun packages/core/scripts/validate-data.ts "{{dir}}"

validate-eval set="eval" projects="data/projects":
    bun packages/core/scripts/validate-eval.ts "{{set}}" "{{projects}}"

strip-exif dir:
    bun packages/core/scripts/strip-exif.ts "{{dir}}"
