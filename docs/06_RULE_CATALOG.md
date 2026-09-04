# 06 — Initial Rule Catalog

> **Implementation status:** The authorized M2 Bank subset implements `BANK-CODE-001` through
> `BANK-HOLDER-006` as applicable, excluding `BANK-HOLDER-007`. The experimental Bank rules,
> JPYC rules, Scanner rules, and Registry change-impact rules remain unimplemented. Registry
> change-impact also requires a separately specified change taxonomy before IDs are assigned.

## 1. Rule policy

- Rule IDs are immutable once released.
- A semantic change that alters compatibility behavior requires rule version notes or a new rule ID.
- Objective incompatibilities may be `error`.
- Heuristics default to `warning`.
- Experimental Profile rules cannot be presented as universal Japanese banking requirements.
- No rule automatically mutates destination data.

## 2. Confidence classes

| Class | Meaning | Error eligible? |
|---|---|---:|
| `schema` | Structurally undeniable input/config error | Yes |
| `registry` | Exact mismatch against versioned data | Yes |
| `profile` | Exact mismatch against selected Profile | Yes |
| `structured-scan` | Parsed key/value configuration | Usually yes |
| `heuristic` | Text-context inference | No, warning only |
| `experimental` | Rule semantics/source not launch-approved | Profile-dependent, normally warning |

## 3. Core rules

| Rule ID | Default | Message key | Condition |
|---|---|---|---|
| `CORE-SCHEMA-001` | error | `input.schema_invalid` | Input does not match the declared runtime schema. |
| `CORE-PROFILE-001` | error | `profile.not_found` | Requested Profile cannot be resolved exactly. |
| `CORE-PROFILE-002` | error | `profile.rail_mismatch` | Destination rail differs from Profile rail. |
| `CORE-REGISTRY-001` | error | `registry.not_found` | Required Registry is missing. |
| `CORE-REGISTRY-002` | error | `registry.digest_mismatch` | Registry digest differs from Profile reference. |
| `CORE-REGISTRY-003` | warning | `registry.stale_metadata` | Registry exceeds Profile-defined age, where such policy is configured. |

Configuration errors may be surfaced as application errors before normal rule execution. Rule IDs remain useful for machine output where possible.

## 4. Bank rules — P0

| Rule ID | Default | Confidence | Condition / behavior |
|---|---|---|---|
| `BANK-CODE-001` | error | schema/profile | `bankCode` is not exactly four ASCII digits under the selected Profile. |
| `BANK-CODE-002` | error | registry | Bank code is absent from the selected Bank Registry. |
| `BANK-BRANCH-001` | error | schema/profile | `branchCode` is not exactly three ASCII digits under the selected Profile. |
| `BANK-BRANCH-002` | error | registry | Branch code is absent from the selected bank entry. |
| `BANK-BRANCH-003` | error | registry | Branch exists elsewhere but does not belong to declared bank. |
| `BANK-TYPE-001` | error | profile | Account type is not allowed by selected Profile. |
| `BANK-NUMBER-001` | error | profile | Account number contains non-ASCII digits or forbidden characters. |
| `BANK-NUMBER-002` | error | profile | Account number length is outside Profile limits. |
| `BANK-HOLDER-001` | error | schema/profile | Account holder is empty after non-mutating presence check. |
| `BANK-HOLDER-002` | warning | profile | Leading or trailing whitespace exists. Raw value remains hidden. |
| `BANK-HOLDER-003` | error | schema/profile | Control, NUL, bidi-control, or other explicitly forbidden invisible character exists. |
| `BANK-HOLDER-004` | warning | profile | Value differs under configured Unicode normalization. No replacement is applied. |
| `BANK-HOLDER-005` | error | profile | Character is outside Profile-declared allowed set. |
| `BANK-HOLDER-006` | error | profile | Encoded byte length exceeds Profile limit. |
| `BANK-HOLDER-007` | warning | profile | Width/script differs from Profile expectation but safe correction cannot be guaranteed. |

### Bank rule notes

- `BANK-CODE-002` and branch rules require a data source approved for the environment.
- A synthetic Registry is sufficient for tests but not a production claim.
- Account number left-padding is never auto-applied.
- Account holder findings never output raw input.
- `BANK-HOLDER-005` uses a Profile-declared exact Unicode character set. `BANK-HOLDER-006`
  supports UTF-8 byte limits in the authorized subset; other bank encodings require sourced,
  explicitly authorized Profiles.
- `active`, `closed`, and `unknown` are Registry metadata. The M2 existence rules do not infer a
  closure policy for which no stable Rule ID or Profile behavior has been specified.
- `BANK-HOLDER-007` remains deferred because no conservative, provider-neutral expectation has
  been approved.

## 5. Experimental bank rules

| Rule ID | Default | Profile | Condition |
|---|---|---|---|
| `ZENGIN-CHAR-001` | warning | `zengin-fb-draft` | Character not permitted by the draft profile's declared set. |
| `ZENGIN-BYTES-001` | warning/error by profile | `zengin-fb-draft` | Encoded field exceeds declared fixed byte limit. |
| `YUCHO-FORMAT-001` | warning | `yucho-transfer-draft` | Input appears to mix symbol-number form with transfer bank fields. |
| `YUCHO-FORMAT-002` | warning | `yucho-transfer-draft` | Declared bank code and field shape are inconsistent with the draft profile. |

These rules remain experimental until exact specifications and target use cases are validated.
Implementations must not elevate them to verified defaults.

## 6. JPYC rules — P0

| Rule ID | Default | Confidence | Condition / behavior |
|---|---|---|---|
| `JPYC-ADDRESS-001` | error | schema | Wallet address is not a valid 20-byte EVM address string. |
| `JPYC-ADDRESS-002` | error | schema | Wallet address is the zero address. |
| `JPYC-ADDRESS-003` | warning | profile | Mixed-case address has invalid checksum, or Profile requests checksum warning. |
| `JPYC-ADDRESS-004` | error | registry | Recipient address equals the configured/current JPYC token contract. |
| `JPYC-CHAIN-001` | error | registry | Chain ID is not supported by selected current JPYC Profile. |
| `JPYC-CHAIN-002` | error | profile | Destination chain ID and application configuration chain ID differ. |
| `JPYC-ENV-001` | error | profile | Environment is unsupported; v0.1 production Profile is mainnet only. |
| `JPYC-CONTRACT-001` | error | profile | Application config is required by the command but token contract is missing. |
| `JPYC-CONTRACT-002` | error | registry | Token contract does not equal the current official contract for the selected chain. |
| `JPYC-CONTRACT-003` | error | registry | Contract is a provenance-backed historical/prepaid JPYC address. Specialized wording only when verified data exists. |

### JPYC rule notes

- `JPYC-CONTRACT-002` catches all non-current contracts without claiming what they are.
- Token symbol/name/decimals are not used; no RPC is performed.
- Address syntax does not prove ownership or ability to receive.
- Lowercase addresses may be syntactically valid; checksum policy is warning-first.

## 7. Scanner rules — P0

| Rule ID | Default | Confidence | Condition / behavior |
|---|---|---|---|
| `SCAN-FILE-001` | info | schema | File skipped because it exceeds configured size. |
| `SCAN-FILE-002` | info | schema | File skipped as binary or unsupported. |
| `JPYC-SCAN-001` | error | structured-scan | Parsed JPYC contract key contains a non-current contract. |
| `JPYC-SCAN-002` | error | structured-scan | Parsed JPYC chain key contains unsupported chain ID. |
| `JPYC-SCAN-003` | error | structured-scan | Parsed chain/contract pair is inconsistent. |
| `JPYC-SCAN-004` | error | registry | Parsed or exact-matched contract is verified historical/prepaid. |
| `JPYC-SCAN-005` | warning | heuristic | JPYC-like key context appears to contain an unknown contract address. |
| `JPYC-SCAN-006` | warning | heuristic | JPYC-like key context appears to contain an unsupported chain ID. |

## 8. Finding construction

Every finding must contain:

- rule ID
- stable message key
- profile ID/version
- field path
- severity
- safe actual classification where useful
- remediation code/message

Recommended remediation codes:

```text
confirm_bank_selection
confirm_branch_selection
compare_registered_account_name
remove_invisible_character
review_unicode_normalization
select_supported_jpyc_chain
replace_with_current_official_contract
confirm_wallet_address
```

## 9. Severity override

Profiles may lower or raise a rule severity only within safety constraints:

- heuristic cannot be raised to error in a verified bundled Profile.
- digest mismatch cannot be lowered below error.
- zero address cannot be lowered below error.
- experimental rules may remain warning until adopted.

## 10. Rule tests

Each P0 rule requires:

1. one valid case;
2. one exact invalid case;
3. one boundary case;
4. stable rule ID/severity/path assertion;
5. redaction assertion if input is sensitive;
6. no-network assertion for JPYC rules.
