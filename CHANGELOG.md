# Changelog

All notable changes to published PayoutJP packages are documented here.

The project follows Semantic Versioning. Before `1.0.0`, minor releases may contain documented
breaking changes.

## [Unreleased]

Source candidate: `0.1.0-alpha.2`, not published. Public package scope remains Core/Bank/CLI.

### Added

- Bank-only JSON/CSV batch `audit` using one Profile, explicit column/account-type mappings,
  quoted multiline UTF-8 CSV, stdin, source locations, generated IDs, and complete report v1 output.
- Per-row `INPUT-SCHEMA-001` errors that keep processing other rows; malformed files, conflicting
  Profiles, unsupported rails, explicit-ID violations, and resource limits abort the command.
- Japanese human diagnostics via `--locale ja`; `init`, `doctor`, `profiles list/show`, and
  `registry status` for synthetic samples and local configuration inspection.
- `prepareBankTransferValidatorV1` with owned immutable Profile/Registry snapshots and lookup
  indexes for repeated validation; public `ItemIdSchema` for input adapters.
- Node 24 Ubuntu/macOS/Windows CI matrix, synthetic Bank benchmarks, and packed-consumer CSV checks.

### Changed

- File/stdin input is bounded; audit limits are 50 MiB, 100,000 rows/findings, 64 KiB CSV record,
  and 8 KiB field. Limit failures never produce a truncated success report.
- Report writes are atomic and protect input/config/mapping/Profile/Registry files, including
  aliases. Audit requires `--overwrite-report` to replace a report; single `validate` replacement
  remains supported.
- Audit text displays at most 100 findings plus an omitted count. JSON preserves the complete report.
- Bank/branch observations are metadata-only, including when sensitive data is mapped into a code
  field. Parser/schema/argument diagnostics do not echo raw values or arbitrary unknown keys.

### Fixed

- Invalid destination IDs return input errors (exit 2) instead of internal errors (exit 3).
- Prepared validators isolate caller-owned Profile parameters and Registry data from later mutations.
- Windows checkouts preserve LF for formatter inputs and deterministic fixtures. CI runs each OS
  to completion independently so one platform failure does not cancel the other results.

### Compatibility and verification

- Report schema remains version 1; bundled Profile and Registry versions/contents are unchanged.
- Local Node 24 verification and packed Core/Bank/CLI consumer checks passed. Linux/Windows CI
  execution and independent usability evaluation remain pending.
- No production Bank Registry is bundled. YAML/JPYC CLI input, mixed-rail/Profile batches,
  Scanner, and the dedicated Action remain deferred.

## [0.1.0-alpha.1] - 2026-09-05

First free OSS alpha published to npm and released from the public source repository.

### Added

- deterministic runtime contracts, validation reports, rule execution, and redaction in
  `@payoutjp/core`;
- conservative structural Bank destination validation with injected local Registries in
  `@payoutjp/bank`;
- UTF-8 JSON single-Bank-destination validation with text/JSON output and CI exit codes in
  `@payoutjp/cli`;
- Apache-2.0 licensing, security reporting, release documentation, and packed-consumer checks.

### Limitations

- No production Bank Registry is bundled.
- The CLI does not support JPYC, YAML/CSV input, batch audit, Scanner, or a dedicated GitHub Action.
- Validation does not prove account existence, recipient identity, wallet ownership, or payment
  success.

There is no migration from an earlier published version.

[Unreleased]: https://github.com/inthecradle/payoutjp/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/inthecradle/payoutjp/releases/tag/v0.1.0-alpha.1
