# @payoutjp/cli

Local Bank destination validation with deterministic text/JSON reports and CI exit codes.
The `0.1.0-alpha.2` source candidate adds JSON/CSV batch audit, explicit CSV mappings, Japanese
human diagnostics, and setup/inspection commands. It is not yet published; the recorded npm
release `0.1.0-alpha.1` supports single JSON `validate` only. Requires Node.js 24.

From an alpha.2 source checkout, install dependencies and build, then define a local command:

```sh
pnpm install --frozen-lockfile
pnpm build
PAYOUTJP_CLI="$PWD/packages/cli/dist/main.js"
payoutjp() { node "$PAYOUTJP_CLI" "$@"; }
payoutjp init --template bank-csv --directory ./payoutjp-demo
cd payoutjp-demo
payoutjp doctor
payoutjp audit recipients.csv --profile bank-generic-jp@0.1.0 --mapping columns.json --locale ja
```

The second fictional recipient deliberately fails with exit code 1. Manually change its fictional
`12X4567` account number to `0123456` and rerun to get PASS. Existing directories are never replaced
by `init`.

Commands:

- `validate <file|-> --profile <id@version>`: one UTF-8 JSON destination or request wrapper.
- `audit <file|-> --profile <id@version>`: one Bank Profile and UTF-8 JSON batch or header CSV.
- `profiles list [--all]` / `profiles show <id@version>`: installed Bank Profiles.
- `registry status` / `doctor`: local Registry digests, Profile references, and environment checks.
- `init --directory <new-directory> [--template bank-csv]`: synthetic CSV starter project.

Use `--format json --output report.json` for complete audit output; text shows at most 100 findings.
Use `--overwrite-report` to replace an existing audit report. Input/config/mapping/Profile/Registry
files, including aliases, cannot be report destinations. Single `validate` retains report replacement.
Inspection commands return pretty JSON even with the default text format.

Canonical CSV columns are `bankCode,branchCode,accountType,accountNumber,accountHolder` and optional
`id`. Values remain strings to preserve leading zeros; there is no column guessing, trimming,
automatic padding, or account-holder correction. `--mapping <json-path>` explicitly maps other
headers, account-type values, and ignored columns. BOM, CRLF/LF, and quoted multiline fields are
supported. Unknown/duplicate headers are errors.

JSON batches have `{ "schemaVersion": "1", "items": [{ "destination": { ... } }] }`.
With no CLI Profile, every interpretable item must provide the same `profileId`.
Row schema errors are `INPUT-SCHEMA-001` findings and do not stop other rows. Malformed documents,
conflicting Profiles, unsupported rails, invalid input IDs, and exceeded limits abort the command.
IDs default to `item-000001` by row order; `--id-policy input` requires unique, non-sensitive IDs
of at most 128 characters. These input IDs appear in reports.

For stdin, use `validate -` or `audit - --input-format csv|json`. Limits: 50 MiB input, 100,000 rows,
64 KiB CSV record, 8 KiB field, and 100,000 findings. YAML destination input and JPYC CLI remain deferred.

Exit codes: 0 below the `--fail-on error|warning|never` threshold; 1 findings meet the threshold;
2 usage/input/configuration errors; 3 internal errors; 4 Profile/Registry integrity errors.
`--fail-on never` does not suppress codes 2–4. `--locale ja` changes human text, preserving canonical JSON.

No production Bank Registry is bundled. The CLI does not verify account existence, recipient
identity, or payment success, and does not send input data over the network. Dependency installation
may access npm. See the [Bank CSV guide](https://github.com/inthecradle/payoutjp/blob/main/docs/PRACTICAL_BANK_CLI.md)
and [PayoutJP repository](https://github.com/inthecradle/payoutjp) for complete examples.
Licensed under Apache-2.0.
