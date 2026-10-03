# 08 — CLI Specification

> **Published alpha:** `0.1.0-alpha.2`. This specification describes implemented Bank
> commands unless explicitly marked deferred. Published alpha.1 supports single JSON `validate` only.
> See the [Bank CSV guide](./PRACTICAL_BANK_CLI.md) for a runnable source-checkout quickstart.

Binary name: `payoutjp`

YAML/JPYC destination input, mixed-rail or mixed-Profile batches, scan, dedicated Action, and
Registry diff/impact remain deferred. YAML is supported for the local configuration file.

## 1. Global behavior

```text
payoutjp [global options] <command> [command options]
```

Global options:

| Option | Default | Description |
|---|---|---|
| `--config <path>` | `./payoutjp.config.yml` if present | Explicit config file. No parent-directory traversal. |
| `--format <text|json>` | `text` | Implemented output renderer. SARIF/JUnit remain RC features. |
| `--output <path>` | stdout | Write canonical report to file. |
| `--fail-on <error|warning|never>` | config or `error` | Exit threshold. |
| `--profile <id[@version]>` | input/config dependent | Profile selection. |
| `--experimental` | false | Permit an experimental local Profile. |
| `--locale <en|ja>` | `en` | Human text/guidance language; canonical JSON is unchanged. |
| `--quiet` | false | Suppress non-report informational output. |
| `--version` | — | Print CLI version. |
| `--help` | — | Print help. |

## 2. Config resolution

Resolution order:

1. explicit command flag;
2. explicit `--config` values;
3. `./payoutjp.config.yml` in current working directory;
4. safe built-in defaults.

Rules:

- Do not search parent directories.
- If an embedded `profileId` and CLI `--profile` differ, return config error rather than silently override.
- Unknown config keys are rejected.
- Relative paths resolve from the config file directory.

## 3. Commands

### 3.1 `validate`

Validate one UTF-8 JSON Bank request or destination. `<input>` is a path or `-` for stdin.

```bash
payoutjp validate <input> --profile <profile>
```

Option:

- `--rail <bank_transfer>`: optional explicit rail assertion for a bare destination.

Examples:

```bash
payoutjp validate fixtures/bank/destinations/valid-synthetic.json \
  --profile bank-generic-jp@0.1.0
```

### 3.2 `audit`

Validate a UTF-8 Bank JSON batch or header CSV using one Profile.

```bash
payoutjp audit <input> [--rail bank_transfer] [--profile <profile>]
```

Rules:

- `.json`/`.csv` infer the input format; stdin or other extensions require `--input-format json|csv`.
- JSON items may omit `profileId` when `--profile` is supplied. Otherwise each interpretable item
  must supply the same selector. Conflicting selectors or another rail are whole-command errors.
- CSV requires `--profile`; number fields stay strings. Unknown or duplicate headers are errors.
- `--mapping <path>` accepts explicit JSON column/account-type mappings and ignored columns.
- `--id-policy generated|input` defaults to generated IDs. Input mode requires all IDs to be
  non-sensitive, unique, at most 128 characters, and consistent between item and destination.
- Empty batches and invalid document syntax are input errors. Row schema errors become error
  findings (`INPUT-SCHEMA-001`, `input.schema.invalid`) while the remaining rows continue.
- Input is bounded to 50 MiB / 100,000 rows / 100,000 findings. CSV records are limited to 64 KiB
  and fields to 8 KiB. Exceeding limits aborts rather than truncating a successful report.
- CSV findings carry physical start lines; JSON findings carry JSON Pointers.
- Text shows at most 100 findings plus an omitted count; JSON contains the complete report.
- Replacing an existing audit report requires `--overwrite-report`.

Examples:

```bash
payoutjp audit recipients.csv \
  --rail bank_transfer \
  --profile bank-generic-jp@0.1.0 \
  --format json \
  --output payoutjp-report.json
```

### 3.3 `profiles list`

```bash
payoutjp profiles list [--rail bank_transfer] [--all]
```

Returns installed Bank Profile identities/statuses as JSON. The default hides deprecated/retired;
`--all` includes them. Listing experimental Profiles does not authorize validation with them.

### 3.4 `profiles show`

```bash
payoutjp profiles show <id[@version]>
```

Returns the installed Profile JSON: status, source notes, rules, parameters, and pinned Registry
references. Inspection permits retired/experimental status without permitting their use by audit.

### 3.5 `registry status`

```bash
payoutjp registry status [--json]
```

Returns verified local Registry ID/version/digest/source metadata and Profile diagnosis. It checks
all installed Profile references and fails on invalid digests or missing pins. It does not fetch updates
or establish freshness, completeness, production eligibility, or account existence.
`--json` is accepted for compatibility; inspection output is already pretty JSON.

### 3.6 `doctor`

```bash
payoutjp doctor
```

Checks Node.js 24, local configuration, installed Bank Profiles/rule parameters, Registry digests,
and pinned references. Returns JSON describing enabled rules and Registry lookup coverage.
No file changes, update downloads, or production-readiness claims.

### 3.7 `init`

```bash
payoutjp init --template bank-csv --directory ./payoutjp-demo
```

Creates a new directory with fictional CSV, explicit mappings, config, and instructions. Existing
directories are rejected. `--template` defaults to `bank-csv`; `--directory` is required.

### 3.8 Deferred commands

`scan` and JPYC CLI adapters remain target-state designs in the Scanner specification. They are
not exposed by this binary. Registry diff/impact requires a separately designed contract.

## 4. Input modes

### Full request wrapper

```json
{
  "schemaVersion": "1",
  "profileId": "bank-generic-jp@0.1.0",
  "destination": {
    "schemaVersion": "1",
    "rail": "bank_transfer",
    "bankCode": "1234",
    "branchCode": "001",
    "accountType": "ordinary",
    "accountNumber": "0123456",
    "accountHolder": "カ）サンプル"
  }
}
```

### Bare destination

Allowed when `--profile` is supplied.

```json
{
  "schemaVersion": "1",
  "rail": "bank_transfer",
  "bankCode": "1234",
  "branchCode": "001",
  "accountType": "ordinary",
  "accountNumber": "0123456",
  "accountHolder": "カ）サンプル"
}
```

## 5. Output channels

- Canonical report: stdout or `--output` file.
- Human diagnostics about malformed CLI usage: stderr.
- For `--format json`, stdout contains JSON only.
- No progress spinner in non-TTY or CI.
- No ANSI color when `NO_COLOR` is set or output is not a TTY.
- Profile/Registry/doctor/init inspection output is JSON independently of `--format text`.
- Report writes are atomic. Inputs, config, mappings, and configured Profile/Registry files or
  directories are protected, including symlink/hard-link aliases. Existing `validate` report
  replacement remains supported; inspection output does not replace an existing file.
- Failed commands may leave an older report untouched; use the exit code before uploading a report.

## 6. Text output

Required structure:

```text
PayoutJP: <PASS|WARNING|FAIL>
Tool: payoutjp@<version>
Profiles: <id@version>[, ...]
Registries: <id@version>[, ...]
Items: N  Passed: N  Warnings: N  Failed: N

Notice: <safety boundary>

<findings grouped by item>
```

Finding format:

```text
ERROR BANK-NUMBER-001 destination.accountNumber
Account number must contain only ASCII digits.
Observed: *****56
Expected: one or more ASCII digits
Action: Confirm the account number without converting or padding it automatically.
```

## 7. JSON output

Both `validate` and `audit` JSON output match `ValidationReportV1`. Canonical JSON:

- UTF-8
- two-space indentation for file/stdout renderer
- stable key order by serializer policy
- no timestamp
- normalized `/` path separators
- newline at EOF
- deterministic `notices` containing the safety boundary and, when applicable, the experimental
  Profile warning

## 8. Exit codes

| Code | Meaning |
|---:|---|
| `0` | Report does not meet the configured fail threshold. |
| `1` | Validation findings meet/exceed `fail-on` threshold. |
| `2` | CLI usage, input parse, or configuration error. |
| `3` | Unexpected internal error. |
| `4` | Profile/Registry integrity or digest failure. |

Examples:

- status WARNING + `--fail-on error` => 0
- status WARNING + `--fail-on warning` => 1
- status FAIL + `--fail-on error` => 1
- any status + `--fail-on never` => 0, unless code 2–4 error occurs

## 9. Privacy rules

- Account holder: `<redacted>`.
- Account number: `*****56` or shorter safe mask.
- Wallet: `0x1234…abcd`.
- Scanner: never print full source line.
- Bank/branch observed values are metadata-only, protecting data placed in the wrong field.
- Parser/schema/usage errors do not echo raw records, arbitrary keys, or argument values.
- JSON output uses the same redaction. v0.1 has no unsafe `--show-raw` option.

## 10. Deterministic IDs

Audit generates an ID from batch index only, e.g. `item-000001`, by default even when an input ID
exists. Opting into `--id-policy input` makes the supplied ID report-visible. These identifiers are
not recipient matching keys across reordered inputs. Never hash sensitive data into visible IDs.

## 11. Error messages

A user-facing error must include:

- category/code;
- safe description;
- relevant path;
- remediation;
- no stack trace or raw input values; this alpha has no debug bypass.

## 12. CLI acceptance tests

- Valid JSON for the implemented Bank subset returns code 0; YAML remains deferred.
- Invalid schema returns code 2 or structured schema finding according to command contract.
- FAIL returns code 1.
- JSON stdout parses with no extra text.
- Sensitive values never appear in stdout/stderr.
- File order does not alter finding order.
- Windows paths are normalized in canonical report.
