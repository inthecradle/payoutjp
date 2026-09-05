# Changelog

All notable changes to published PayoutJP packages are documented here.

The project follows Semantic Versioning. Before `1.0.0`, minor releases may contain documented
breaking changes.

## [Unreleased]

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
