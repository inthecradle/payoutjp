# 12 — Security, Privacy, and Legal Boundary

## 1. Purpose

This document defines product and implementation boundaries that keep PayoutJP a local compatibility checker rather than a payment execution, custody, or verification service.

It is an engineering risk document, not legal advice or a final regulatory opinion.

## 2. Data handled

### Potentially sensitive

- bank account number
- bank account holder name
- internal recipient IDs
- source file paths
- configuration structure

### Public or lower sensitivity

- bank/branch code reference data
- public blockchain chain IDs
- public token contract addresses
- public wallet addresses, although still treated as pseudonymous user data and shortened in reports

### Prohibited input/handling

- private keys
- seed phrases/mnemonics
- bank login credentials
- API secrets
- identity documents
- KYC evidence

The scanner may encounter prohibited values accidentally, but must neither parse them as required inputs nor expose them.

## 3. Privacy architecture

- Validation occurs in the customer's process/CI runner.
- No telemetry or analytics.
- No hosted ingestion endpoint.
- No automatic crash reporting.
- No remote Profile/Registry update during a run.
- Canonical reports are redacted by design.

## 4. Redaction policy

| Field | Default output |
|---|---|
| account holder | `<redacted>` |
| account number | all but last 2 digits masked |
| bank/branch code | may be shown |
| wallet address | shortened prefix/suffix |
| token contract | shortened in findings; full value remains available only in local Registry file |
| source line | never shown |
| file path | normalized relative path only |

Redaction occurs before renderer boundaries. Renderers must not receive raw sensitive values where avoidable.

## 5. Scanner threat model

Threats:

- executing malicious project files;
- following symlinks outside workspace;
- reading huge/binary files;
- leaking secrets in contextual lines;
- regex denial of service;
- path traversal;
- malicious YAML tags.

Controls:

- never import/evaluate source files;
- safe YAML schema only;
- no symlink following by default;
- bounded file size;
- linear or bounded regexes;
- normalized workspace-relative paths;
- no full-line output;
- deterministic file count limits configurable for CI.

## 6. Supply-chain security

- Pin package manager via `packageManager` field.
- Commit lockfile.
- Use frozen lockfile in CI.
- Minimize dependencies.
- No install scripts unless reviewed and documented.
- Bundle GitHub Action and verify reproducibility/freshness.
- Use Node.js 24 action runtime.
- Add dependency update automation only after baseline is stable.
- Review Registry/Profile update diffs separately from code changes.

## 7. Registry integrity

- Each pack has ID, immutable version, source, and digest.
- Digest mismatch is fatal regardless of `fail-on`.
- Current JPYC entries require official provenance.
- Bank production data source is a launch blocker until rights and quality are confirmed.
- Do not scrape bank sites at runtime.

## 8. Money-movement boundary

PayoutJP does not:

- initiate, transmit, or mediate bank transfer instructions;
- connect to a bank using customer credentials;
- construct, sign, or broadcast JPYC transactions;
- hold or control keys/assets;
- exchange JPYC and fiat;
- charge a fee based on transfer execution;
- recommend a recipient or route.

PayoutJP returns only a compatibility result against declared local rules/data.

## 9. Why the boundary matters

Official Japanese guidance describes certain services that transmit payment instructions or access bank information as potentially falling within regulated electronic payment intermediary activities. Electronic payment instruments and custody/mediation also have separate regulatory considerations. The implementation intentionally stays away from those functions.

This design does not itself establish legal non-applicability. Before public commercialization, a Japanese financial-regulation specialist should review the final feature set and product language.

## 10. Product claims

Allowed:

- “Compatible with `profile@version`.”
- “Configuration matches `registry@version`.”
- “No declared validation error was found.”

Prohibited:

- “This account exists.”
- “The account holder is verified.”
- “This wallet belongs to the recipient.”
- “It is safe to send.”
- “Payment will succeed.”
- “Accepted by every Japanese bank.”
- “Regulatory compliance guaranteed.”

## 11. Disclaimer requirements

CLI help, README, and reports should include a concise statement:

> PayoutJP checks local data and configuration against the selected Profile and Registry. It does not verify account existence, recipient identity, wallet ownership, or payment success.

Experimental Profile output additionally states:

> This Profile is experimental and must be verified against the receiving bank, service, or current specification before production use.

## 12. Error handling

- Never include raw input values in thrown error messages.
- Sanitized stack traces only in explicit debug mode.
- Debug mode still obeys redaction.
- Unexpected scanner parse errors identify file/path but not content.

## 13. Security reporting

Before public release, add a `SECURITY.md` with:

- supported versions;
- private reporting channel;
- expected response policy;
- explicit statement not to submit real bank account data in public issues.

This file is not generated automatically until contact details are decided.

## 14. Pre-release review checklist

- [ ] No network dependency in validation path.
- [ ] No RPC client or transport instantiated.
- [ ] No private-key package/API exposed.
- [ ] Redaction tests pass in all renderers.
- [ ] Scanner never executes files.
- [ ] Symlink and path traversal tests pass.
- [ ] Registry digests are verified.
- [ ] Production bank data source reviewed.
- [ ] Product claims reviewed.
- [ ] Legal review completed for final marketed feature set.
