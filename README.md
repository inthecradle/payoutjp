# PayoutJP

[English](./README.md) | [日本語](./README.ja.md)

PayoutJP is a local-first compatibility toolkit for validating Japanese bank and JPYC payout
destinations before they reach a bank or wallet integration.

> Status: `0.1.0-alpha.1` free OSS alpha. Core, the conservative Bank subset, and the
> single-destination Bank CLI are published on npm under the `alpha` tag. JPYC is implemented as an
> unpublished library preview. Scanner and Action remain placeholders.

## Design goals

- Run locally without uploading payout data.
- Produce deterministic results from versioned profiles and registries.
- Prefer objective compatibility errors over speculative validation.
- Keep bank and JPYC validation separate from money movement.
- Share one domain implementation across the library, CLI, scanner, and GitHub Action.

## Safety boundary

PayoutJP does not:

- initiate bank transfers or connect to bank APIs;
- verify that an account exists or that its holder matches a person;
- create, sign, or broadcast JPYC transactions;
- hold private keys, seed phrases, bank credentials, or customer assets;
- make RPC calls or check balances, gas, receipts, or confirmations;
- upload validation data or emit telemetry.

## Workspace

```text
packages/
  core/
  bank/
  jpyc/
  scanner/
  cli/
  action/
```

`@payoutjp/core` provides the deterministic validation contracts and engine. `@payoutjp/bank`
provides conservative Bank validation. `@payoutjp/jpyc` provides JPYC destination and application
configuration validation against an exact official Registry snapshot. `@payoutjp/cli` provides the
implemented JSON single-Bank-destination `validate` command with text/JSON reports and CI exit
codes. Scanner and Action retain bootstrap exports.

Production bank data, provider-specific Bank rules, experimental Zengin/Yucho Profiles, Scanner,
and GitHub Action behavior remain outside the implemented scope.

## CLI

The current CLI accepts one UTF-8 JSON Bank destination or request wrapper. A bare destination must
select a Profile explicitly:

Install the alpha:

```sh
npm install --global @payoutjp/cli@alpha
payoutjp --version
```

Create `destination.json` using fictional data first:

```json
{
  "schemaVersion": "1",
  "rail": "bank_transfer",
  "bankCode": "1234",
  "branchCode": "001",
  "accountType": "ordinary",
  "accountNumber": "0123456",
  "accountHolder": "SYNTHETIC"
}
```

Then run:

```sh
payoutjp validate destination.json --profile bank-generic-jp@0.1.0
```

From a source checkout, build first and use the equivalent command:

```sh
node packages/cli/dist/main.js validate fixtures/bank/destinations/valid-synthetic.json \
  --profile bank-generic-jp@0.1.0
```

Use `--format json`, `--output <path>`, and `--fail-on <error|warning|never>` for CI. An explicit
`--config` or `./payoutjp.config.yml` may provide `failOn` and local JSON Profile/Registry paths;
relative paths resolve from the config file. YAML/CSV input, batch audit, profile/registry discovery,
JPYC CLI validation, Scanner, and dedicated Action behavior are not included in this M4 subset.

PayoutJP checks local data and configuration against the selected Profile and Registry. It does not
verify account existence, recipient identity, wallet ownership, or payment success. No production
Bank Registry is bundled; `bank-generic-jp` performs conservative structural checks only.

## Library packages

The first alpha publishes `@payoutjp/core`, `@payoutjp/bank`, and `@payoutjp/cli`. The workspace root,
`@payoutjp/jpyc`, `@payoutjp/scanner`, and `@payoutjp/action` remain private npm packages. Source code
in this repository is covered by the repository license even when its package is not published.

## Development

Requirements:

- Node.js 24
- pnpm 11.25.0 through Corepack

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm verify
pnpm release:check
```

`pnpm verify` runs formatting checks, linting, strict TypeScript checks, smoke tests, and builds for
all workspace packages.

`pnpm release:check` also audits production dependencies, packs the three public packages, installs
them into a temporary clean consumer, checks their manifests and licenses, imports their public APIs,
and executes the packaged CLI. It never publishes, tags, or retains artifacts.

See [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md),
[CHANGELOG.md](./CHANGELOG.md), and [RELEASING.md](./RELEASING.md) for project and release policy.

## Technical documentation

- [Scope and non-goals](./docs/02_SCOPE_AND_NON_GOALS.md)
- [Domain model](./docs/03_DOMAIN_MODEL.md)
- [Architecture](./docs/04_ARCHITECTURE.md)
- [Data contracts](./docs/05_DATA_CONTRACTS.md)
- [Rule catalog](./docs/06_RULE_CATALOG.md)
- [Registries and profiles](./docs/07_REGISTRIES_AND_PROFILES.md)
- [CLI specification](./docs/08_CLI_SPEC.md)
- [Scanner specification](./docs/09_SCANNER_SPEC.md)
- [GitHub Action specification](./docs/10_GITHUB_ACTION_SPEC.md)
- [Test strategy](./docs/11_TEST_STRATEGY.md)
- [Security and privacy](./docs/12_SECURITY_PRIVACY_LEGAL.md)
- [Repository tooling](./docs/13_REPOSITORY_TOOLING.md)
- [Release and versioning](./docs/14_RELEASE_VERSIONING.md)
- [Architecture decisions](./docs/adr/)

These documents describe intended behavior as well as implemented behavior. The status notice above
and released package versions are authoritative for current availability.

## License

Licensed under the [Apache License 2.0](./LICENSE). The license does not grant rights to project
trademarks. Third-party Registry data and future separately distributed assets may have their own
terms.
