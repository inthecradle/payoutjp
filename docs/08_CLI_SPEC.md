# 08 — CLI Specification

Binary name: `payoutjp`

> **Implementation status:** PJP-401–PJP-403, PJP-406, and PJP-410–PJP-412 are implemented as a
> JSON single-Bank-destination `validate` command with text/JSON output and the exit-code policy.
> The other commands, YAML/CSV input, JPYC CLI adaptation, `scan`, and dedicated Action integration
> remain deferred. Possible Registry diff or impact commands have no approved contracts yet.

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

Validate one UTF-8 JSON Bank request or destination.

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

Sections 3.2–3.6 describe the target-state command design only and are not exposed by the current
binary.

### 3.2 `audit`

Validate a batch manifest or canonical CSV.

```bash
payoutjp audit <input> [--rail <rail>] --profile <profile>
```

Rules:

- JSON/YAML batch can contain mixed rails and per-item Profiles.
- CSV is one rail and one Profile per command.
- UTF-8 only.
- Empty batch is a user input error.

Examples:

```bash
payoutjp audit recipients.csv \
  --rail bank_transfer \
  --profile bank-generic-jp@0.1.0 \
  --format json \
  --output payoutjp-report.json
```

### 3.3 `scan`

Scan repository/configuration files for JPYC route configuration issues.

```bash
payoutjp scan [paths...]
```

Options:

| Option | Description |
|---|---|
| `--include <glob...>` | Additional include globs. |
| `--exclude <glob...>` | Additional exclude globs. |
| `--max-file-bytes <n>` | Override safe file-size ceiling. |
| `--profile <id>` | JPYC Profile; defaults to current mainnet Profile if configured. |

Examples:

```bash
payoutjp scan . --profile jpyc-current-mainnet@2026.09.02
payoutjp scan src config .env.production --format json
```

### 3.4 `profiles list`

```bash
payoutjp profiles list [--rail bank_transfer|jpyc] [--all]
```

Default hides deprecated/retired and marks experimental.

### 3.5 `profiles show`

```bash
payoutjp profiles show <id[@version]>
```

Shows status, source notes, rules, parameters, and Registry references. It must not dump proprietary pack content beyond installed local data.

### 3.6 `registry status`

```bash
payoutjp registry status [--json]
```

Shows:

- ID/version
- digest validity
- source publisher
- retrieved/effective date
- Profile references
- experimental/production eligibility

It does not fetch updates.

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

The implemented `validate` JSON output exactly matches `ValidationReportV1`. Canonical JSON:

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
- JSON output uses the same redaction. v0.1 has no unsafe `--show-raw` option.

## 10. Deterministic IDs

If input item has no `id`, generate a stable ID from batch index only, e.g. `item-000001`. Do not hash sensitive raw data into a report-visible identifier.

## 11. Error messages

A user-facing error must include:

- category/code;
- safe description;
- relevant path;
- remediation;
- no stack trace unless `PAYOUTJP_DEBUG=1` and even then no raw input values.

## 12. CLI acceptance tests

- Valid JSON for the implemented Bank subset returns code 0; YAML remains deferred.
- Invalid schema returns code 2 or structured schema finding according to command contract.
- FAIL returns code 1.
- JSON stdout parses with no extra text.
- Sensitive values never appear in stdout/stderr.
- File order does not alter finding order.
- Windows paths are normalized in canonical report.
