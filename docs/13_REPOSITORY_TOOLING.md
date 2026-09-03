# 13 — Repository Structure and Tooling

## 1. Proposed repository tree

```text
.
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── vitest.config.ts
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── application-errors.ts
│   │   │   ├── engine.ts
│   │   │   ├── findings.ts
│   │   │   ├── profiles.ts
│   │   │   ├── registries.ts
│   │   │   ├── reports.ts
│   │   │   ├── rules.ts
│   │   │   ├── redaction.ts
│   │   │   └── index.ts
│   │   └── test/
│   ├── bank/
│   │   ├── src/
│   │   │   ├── schema.ts
│   │   │   ├── rules/
│   │   │   ├── profiles/
│   │   │   └── index.ts
│   │   └── test/
│   ├── jpyc/
│   │   ├── src/
│   │   │   ├── schema.ts
│   │   │   ├── rules/
│   │   │   ├── profiles/
│   │   │   ├── registries/
│   │   │   └── index.ts
│   │   └── test/
│   ├── scanner/
│   │   ├── src/
│   │   │   ├── discover.ts
│   │   │   ├── parsers/
│   │   │   ├── candidates.ts
│   │   │   ├── scan.ts
│   │   │   └── index.ts
│   │   └── test/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   ├── loaders/
│   │   │   ├── renderers/
│   │   │   ├── application.ts
│   │   │   └── main.ts
│   │   └── test/
│   └── action/
│       ├── action.yml
│       ├── src/main.ts
│       ├── dist/index.js
│       └── test/
├── profiles/
│   ├── bank-generic-jp/
│   ├── zengin-fb-draft/
│   ├── yucho-transfer-draft/
│   └── jpyc-current-mainnet/
├── registries/
│   ├── banks-synthetic/
│   └── jpyc-official-mainnet/
├── fixtures/
├── docs/
└── .github/workflows/
```

The exact file split may evolve, but package responsibilities and dependency direction are fixed.

## 2. Runtime and language

- Node.js 24
- TypeScript strict mode
- ECMAScript modules for normal packages
- UTF-8 source and data files
- package exports explicitly declared

Recommended compiler options:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

These options should change only when a concrete tool conflict is demonstrated.

## 3. Package manager

Use pnpm workspace.

Root `package.json` should include:

```json
{
  "private": true,
  "engines": {
    "node": ">=24 <25"
  },
  "packageManager": "pnpm@<pinned-version>"
}
```

Pin the actual pnpm version used during bootstrap; do not leave a placeholder in implemented code.

## 4. Core dependencies

Approved categories:

| Need | Preferred tool |
|---|---|
| Runtime schema | Zod |
| CLI parsing | Commander |
| YAML | `yaml` |
| CSV | a small maintained CSV parser |
| File globs | `fast-glob` or equivalent maintained library |
| EVM address utilities | `viem` pure address utilities only |
| Testing | Vitest |
| Lint/format | Biome |
| GitHub Action API | `@actions/core` |

Dependency selection rules:

- Confirm Node.js 24 compatibility at implementation time.
- Avoid packages with native binaries.
- Avoid blockchain SDKs that pull RPC, wallet, signer, or transaction behavior when a pure utility suffices.
- Avoid framework-level dependency injection or web frameworks.

## 5. Build strategy

### Libraries and CLI

Prefer TypeScript project references and `tsc -b` for predictable declarations and output. A lightweight bundler may be used only if package/CLI distribution requires it and the decision is recorded.

### GitHub Action

Bundle all runtime dependencies into pure JavaScript under `packages/action/dist/index.js`. The bundle may be CommonJS if required by the chosen action bundler even though source packages are ESM.

## 6. Root scripts

Required:

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:coverage": "pnpm -r test:coverage",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "action:bundle": "pnpm --filter @payoutjp/action bundle",
    "action:check-bundle": "pnpm --filter @payoutjp/action check-bundle",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

Exact commands may differ by selected tool version, but the named capabilities and one-command `verify` gate are mandatory.

## 7. Package scripts

Each package should expose at least:

- `build`
- `typecheck`
- `test`
- `test:coverage`
- `clean`

CLI additionally exposes a development command if useful. Action exposes `bundle` and `check-bundle`.

## 8. Public API policy

- Export public symbols only through package `src/index.ts`.
- No deep imports from consumers.
- Internal modules use explicit paths.
- Types and runtime schemas for public input/output are exported together.
- Experimental APIs are named/documented as experimental.

## 9. Coding conventions

- File names: kebab-case.
- Type/interface/schema names: PascalCase with `V1` for versioned contracts.
- Functions/variables: camelCase.
- Rule IDs: uppercase hyphenated stable strings.
- No default exports in libraries.
- Prefer readonly inputs/outputs.
- Use exhaustive switches with `never` checks.
- Use `Result`-like explicit outcomes or typed application errors rather than uncontrolled exceptions in domain code.

## 10. Data files

- JSON is canonical for released Profile/Registry snapshots.
- YAML may be used for authoring examples or customer local Profiles.
- Generated digest/index files are checked in if required for offline validation.
- Generated data must include generator version and source metadata.
- Do not edit generated snapshots manually; update source/generator and regenerate.

## 11. CI

Minimum workflow:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/setup@v2
        with:
          runtime: node@24
          install: false
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
```

Maintainers must verify current action major versions when updating CI; the requirements are Node.js 24 and frozen dependency installation.

## 12. Generated action bundle

CI procedure:

```text
pnpm action:bundle
git diff --exit-code -- packages/action/dist
```

The committed bundle is generated, not hand-edited.

## 13. Repository hygiene

- `.gitignore` excludes node modules, build outputs except committed action bundle, coverage, temporary reports, local Profiles/Registries containing customer data.
- `.npmrc` should enforce reasonable security/reproducibility settings compatible with current pnpm.
- No postinstall network fetch for Profile/Registry data.
- No example containing real bank account or private key.

## 14. Documentation changes

Any public data contract or rule change updates:

- `docs/05_DATA_CONTRACTS.md`
- `docs/06_RULE_CATALOG.md`
- tests/fixtures
- changelog/release notes when versions exist
- ADR if architectural
