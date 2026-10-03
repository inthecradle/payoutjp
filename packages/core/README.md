# @payoutjp/core

Deterministic validation contracts, report aggregation, rule execution, Registry integrity checks,
and redaction primitives for PayoutJP.

`0.1.0-alpha.1` is the recorded published release; `0.1.0-alpha.2` is an unpublished source candidate.
Requires Node.js 24. The candidate preserves `ValidationReportV1` and exports `ItemIdSchema` so
adapters can validate report-visible identifiers at the input boundary.

For reproducibility, reports identify the tool, Profile versions, and exact Registry digests, and
omit timestamps. Account holders are redacted, account numbers masked, and wallet addresses shortened.
Caller-provided IDs are metadata and must not contain sensitive values.

Use `calculateRegistryEnvelopeSha256` to hash a canonical Registry envelope with its `sha256` field
omitted. Integrity does not establish data freshness or authority. Core contains no rail-specific
rules, transfer execution, network access, or telemetry.

See the [PayoutJP repository](https://github.com/inthecradle/payoutjp) for API documentation, safety
boundaries, and examples. Licensed under Apache-2.0.
