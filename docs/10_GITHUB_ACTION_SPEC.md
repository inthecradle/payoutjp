# 10 — GitHub Action Specification

## 1. Action type

JavaScript Action bundled as pure JavaScript.

```yaml
runs:
  using: node24
  main: dist/index.js
```

The action does not perform repository checkout. The workflow author must use `actions/checkout` first.

## 2. Proposed metadata

```yaml
name: PayoutJP Compatibility Check
description: Validate Japanese bank and JPYC payout destination compatibility locally in GitHub Actions.
author: PayoutJP

inputs:
  command:
    description: validate, audit, or scan
    required: false
    default: scan
  input:
    description: Input path for validate or audit
    required: false
  paths:
    description: Newline-separated paths for scan
    required: false
    default: .
  config:
    description: Path to payoutjp.config.yml
    required: false
    default: payoutjp.config.yml
  profile:
    description: Profile ID and optional version
    required: false
  fail-on:
    description: error, warning, or never
    required: false
    default: error
  report-path:
    description: Path for canonical JSON report
    required: false
    default: payoutjp-report.json
  max-annotations:
    description: Maximum annotations emitted; remaining findings stay in summary/report
    required: false
    default: "50"

outputs:
  status:
    description: PASS, WARNING, or FAIL
  errors:
    description: Error finding count
  warnings:
    description: Warning finding count
  infos:
    description: Informational finding count
  report-path:
    description: Generated JSON report path

runs:
  using: node24
  main: dist/index.js
```

## 3. Behavior

1. Parse action inputs.
2. Resolve workspace-relative paths.
3. Call the shared application API.
4. Always write canonical JSON report when application execution succeeds.
5. Emit up to `max-annotations` findings.
6. Write Job Summary.
7. Set outputs.
8. Apply `fail-on` policy using action failure status.

No GitHub token is required for v0.1 because the action uses workflow commands, annotations, outputs, and Step Summary only.

## 4. Annotation mapping

| Finding severity | GitHub annotation |
|---|---|
| error | `core.error` |
| warning | `core.warning` |
| info | `core.notice` |

Annotation fields:

- title: `PayoutJP <ruleId>`
- message: safe message + remediation
- file: normalized relative path when available
- startLine/startColumn: when available

Never include raw account holder, full account number, full wallet address, or source line.

## 5. Job Summary

Suggested summary:

```markdown
# PayoutJP Compatibility Check

**Status:** FAIL  
**Profile:** jpyc-current-mainnet@2026.09.02  
**Registry:** jpyc-official-mainnet@2026-09-02

| Items | Passed | Warnings | Failed |
|---:|---:|---:|---:|
| 14 | 12 | 1 | 1 |

## Findings

- `JPYC-CONTRACT-002` — 1 error
- `BANK-HOLDER-004` — 1 warning

Full redacted report: `payoutjp-report.json`
```

If findings exceed the annotation cap, state how many were omitted from annotations and retained in the report.

## 6. Workflow examples

### Repository scan

```yaml
name: Payout compatibility

on:
  pull_request:
  push:
    branches: [main]

jobs:
  payoutjp:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
      - uses: payoutjp/action@v0
        with:
          command: scan
          paths: |
            src
            config
            .env.example
          profile: jpyc-current-mainnet@2026.09.02
          fail-on: error
```

### Batch audit

```yaml
- uses: payoutjp/action@v0
  with:
    command: audit
    input: testdata/recipients.csv
    profile: bank-generic-jp@0.1.0
    fail-on: warning
```

The exact public action repository/version is provisional.

## 7. Security behavior

- No telemetry.
- No network calls.
- No token input.
- No checkout or write permissions required.
- Use normalized workspace paths; reject traversal outside `GITHUB_WORKSPACE` unless explicitly designed later.
- Do not print action input content.
- Do not upload artifacts automatically. Workflow owners may upload the redacted report themselves.

## 8. Bundle policy

- Source in `packages/action/src`.
- Bundle to `packages/action/dist/index.js` using an approved bundler.
- Bundle is committed because GitHub executes repository content directly.
- CI verifies bundle is current by rebuilding and checking clean git diff.
- Native/binary runtime dependencies are prohibited.

## 9. Failure handling

- Findings at/above `fail-on`: call `core.setFailed` after annotations/summary/report are written.
- Input/config error: fail action with safe message.
- Internal error: fail action, hide stack unless debug enabled, never echo source content.
- Registry integrity error: fail regardless of `fail-on: never`.

## 10. Non-goals

- PR comment creation
- check-run API customization
- GitHub App installation
- marketplace billing
- remote Profile download
- automatic repository modification

## 11. Acceptance tests

- `action.yml` uses Node.js 24.
- Scan workflow on fixture repository emits expected annotations.
- Output counts match JSON report.
- `fail-on` behavior matches CLI.
- Annotation cap works.
- Sensitive fixture strings do not appear in action logs or summary.
- Rebuilt bundle leaves no diff.
