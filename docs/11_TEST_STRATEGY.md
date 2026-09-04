# 11 — Test Strategy

## 1. Objectives

Testing must prove:

1. validation correctness for declared rules;
2. deterministic output;
3. privacy-safe rendering;
4. Registry/Profile integrity;
5. no network or code execution;
6. CLI/Action behavior matches library behavior.

## 2. Test layers

| Layer | Purpose |
|---|---|
| Unit | Individual schema, rule, redaction, sort, parser behavior |
| Contract | Runtime schemas and canonical JSON compatibility |
| Integration | Profile + Registry + engine + renderer |
| CLI | Commands, stdout/stderr, exit codes, files |
| Scanner fixture | Safe discovery, parser, heuristic, redaction |
| Action fixture | Inputs, annotations, summary, outputs, failure |
| Consumer | Import built packages from a temporary external project |
| Property | Unicode/numeric/address boundary exploration |

## 3. Fixture principles

- Never use real customer data.
- Bank Registry is synthetic until production source is approved.
- Account holder fixtures are fictional.
- Wallet addresses are deterministic synthetic values except official token contract entries.
- Clearly label invalid addresses and do not present them as recipient recommendations.
- File fixtures may contain fake secrets only to prove redaction; mark them non-production.

Suggested tree:

```text
fixtures/
  bank/
    registry/
    profiles/
    destinations/
    batches/
  jpyc/
    registry/
    destinations/
    application-config/
  scanner-projects/
    valid/
    invalid-structured/
    heuristic/
    secret-adjacent/
  expected/
    cli/
    reports/
```

## 4. Core test matrix

### Engine

- no findings => PASS
- warnings only => WARNING
- any error => FAIL
- item aggregation
- stable finding order under shuffled rule/file registration
- exact Profile/Registry references
- digest mismatch
- duplicate rule IDs
- duplicate Registry IDs
- no timestamp/absolute path in canonical report

### Redaction

- account holder never appears
- account number only masked
- wallet shortened
- source line not emitted
- thrown error with raw input is sanitized at boundary
- JSON/text/SARIF/JUnit/GitHub all use shared safe fields

## 5. Bank tests

Minimum cases:

| Area | Cases |
|---|---|
| Bank code | valid, too short, full-width digits, letters, unknown |
| Branch code | valid, too short, full-width digits, unknown, belongs to other bank |
| Account type | allowed, disallowed, unknown enum |
| Account number | 1/6/7/8 digits, leading zero, spaces, full-width, punctuation |
| Account holder | empty, whitespace, control char, bidi char, NFC/NFD difference, allowed/disallowed charset, byte boundary |
| Registry | duplicate bank, duplicate branch, closed/unknown status behavior |
| Experimental | draft profile is clearly marked and requires explicit enablement |

No test should assert that a synthetic bank/branch exists in reality.

The authorized M2 suite covers all non-experimental rows applicable to `BANK-HOLDER-006` with the
fixture-only Profile. The experimental row and `BANK-HOLDER-007` remain deferred with their held
implementation scope. Validation tests install a `fetch` spy and assert that the Bank validation
path performs no outbound request.

## 6. JPYC tests

Official current Registry cases:

- chain 1 + current contract
- chain 137 + current contract
- chain 43114 + current contract
- chain 8217 + current contract
- unsupported chain
- destination/application-config chain mismatch
- malformed address lengths
- non-hex address
- zero address
- lowercase valid address
- valid checksummed address
- mixed-case invalid checksum warning
- recipient equals token contract
- non-current contract mismatch
- historical specialized message only when provenance-backed entry is present
- current Profile rejects testnet environment

No test contacts an RPC endpoint or block explorer.

The M3 suite covers the four official current chain/contract pairs, EIP-55 warning policy,
unsupported routes, recipient/contract confusion, exact Registry integrity, and generic versus
provenance-backed historical contract findings. It spies on `fetch` and verifies that validation
does not mutate inputs or perform network access.

## 7. Scanner tests

- JSON exact keys
- YAML nested `jpyc` object
- `.env` exact prefix keys
- TS/JS JPYC-prefixed literal assignment
- unrelated `chainId` ignored
- unrelated token contract ignored
- malformed structured discovered file policy
- explicit malformed file policy
- binary file skip
- oversized file skip
- symlink not followed
- path normalization
- secret-adjacent line redacted
- deterministic file traversal

## 8. CLI tests

Use process-level tests on built CLI where practical.

Assertions:

- exit code
- stdout/stderr separation
- JSON parseability
- trailing newline
- no ANSI in non-TTY
- config precedence
- conflicting embedded/flag Profile error
- `--experimental` gate
- fail-on matrix
- output file creation
- no sensitive values in any output

## 9. GitHub Action tests

- unit test action input mapping with mocked `@actions/core`.
- integration test bundled action in a fixture workflow or local runner where feasible.
- verify annotations include file/line but no raw source line.
- verify Job Summary count and cap.
- verify bundle freshness.
- verify no token/network requirement.

## 10. Golden tests

Golden files are appropriate for:

- canonical JSON report
- text CLI output
- Job Summary markdown
- SARIF/JUnit structure

Avoid brittle data:

- timestamps
- absolute paths
- random IDs
- dependency stack traces

Any golden update must be reviewed as a behavior change, not accepted automatically.

## 11. Property-based tests

Before RC, use property tests for:

- arbitrary Unicode does not crash account-holder validation;
- all non-ASCII digit lookalikes are not silently treated as ASCII;
- account number leading zeros survive parse/serialize;
- finding sort is stable and total;
- random 40-hex addresses follow address/checksum policy;
- redaction output never contains source input substrings above a safe threshold.

## 12. Coverage targets

For RC:

- core: 95% statements/branches
- bank and jpyc rule packages: 95% statements, 90% branches
- scanner: 90% statements/branches
- cli/action adapters: 85% statements/branches

Coverage does not replace fixture quality.

## 13. CI matrix

### M0–M6 minimum

- Ubuntu latest
- Node.js 24
- frozen pnpm lockfile
- `pnpm verify`

### RC

- Ubuntu, macOS, Windows where package/tool compatibility permits
- Node.js 24
- package consumer tests
- action bundle freshness
- no-network test mode

## 14. Network guard

At least one test layer must fail any attempted outbound network access by validation packages. Options include process policy, mocked global fetch, or dependency scanning. The implementation choice must be documented.

## 15. Definition of done for a rule

A rule is not complete until:

- runtime params schema exists;
- rule has stable ID and message key;
- valid/invalid/boundary tests exist;
- finding is redacted;
- Profile enables it explicitly;
- documentation table is updated;
- `pnpm verify` succeeds.
