# 09 — JPYC Configuration Scanner Specification

## 1. Goal

Find likely JPYC route configuration mistakes in source/config files without executing code and without sending data outside the local process.

The scanner is not a general secret scanner, smart contract auditor, or dependency analyzer.

## 2. Primary detections

1. Structured JPYC contract key contains a contract that is not current for the selected chain.
2. Structured JPYC chain key contains an unsupported chain ID.
3. Structured chain/contract pair is inconsistent.
4. A provenance-backed historical/prepaid contract is found.
5. A high-precision text context suggests an unknown JPYC contract or chain.

## 3. Supported files

### Structured, P0

- `.json`
- `.yaml`
- `.yml`
- `.env`
- `.env.*`

### Restricted text heuristic, P0

- `.ts`, `.tsx`
- `.js`, `.jsx`
- `.mjs`, `.cjs`
- `.toml`
- `.properties`
- `Dockerfile` and selected extensionless config files only when explicitly included

### Not supported in v0.1

- compiled/binary files
- archives
- minified bundles
- source maps
- AST or runtime evaluation
- templating languages requiring execution
- remote repositories/URLs

## 4. Default discovery

Include:

```text
**/.env*
**/*.{json,yaml,yml,ts,tsx,js,jsx,mjs,cjs,toml,properties}
```

Exclude:

```text
**/.git/**
**/node_modules/**
**/dist/**
**/build/**
**/coverage/**
**/.next/**
**/.turbo/**
**/vendor/**
**/*.min.js
**/*.map
```

Rules:

- Do not follow symlinks by default.
- Normalize paths relative to scan root.
- Sort discovered paths before reading.
- Default maximum size: 5 MiB per file.
- Detect NUL bytes and skip likely binary files.

## 5. Key recognition

### Contract keys

High-confidence exact/normalized aliases:

```text
JPYC_CONTRACT_ADDRESS
JPYC_TOKEN_ADDRESS
jpycContractAddress
jpycTokenAddress
jpyc.contractAddress
jpyc.tokenAddress
```

Generic keys such as `tokenContract`, `contractAddress`, or `address` require an enclosing JPYC object/path or nearby JPYC-prefixed key.

### Chain keys

```text
JPYC_CHAIN_ID
jpycChainId
jpyc.chainId
```

Generic `chainId` requires an enclosing JPYC object/path. Never flag every generic chain ID in a Web3 project.

## 6. Parser behavior

### JSON/YAML

- Parse data as values only.
- Traverse object paths.
- Match normalized keys.
- Pair chain and contract values from the same object, nearest JPYC parent, or explicit config schema.
- Preserve source location where parser support allows; otherwise use JSON pointer without line.
- Never deserialize custom classes or tags that execute code.

### `.env`

- Parse assignment names and raw scalar values.
- Ignore comments and blank lines.
- Do not expand variable references.
- Do not print values except safe shortened public address/chain metadata.
- Pair `JPYC_CHAIN_ID` and `JPYC_CONTRACT_ADDRESS` within the same file.

### TS/JS/text heuristic

Only match assignment-like lines whose key contains `JPYC` and whose value is a literal chain ID or `0x` address.

Examples that may create a candidate:

```ts
const JPYC_CONTRACT_ADDRESS = "0x...";
export const jpycChainId = 137;
```

Examples that must not be interpreted:

```ts
const chainId = 137;               // no JPYC context
const contractAddress = userInput; // not a literal
function getJPYCAddress() {}        // no configured value
```

Heuristic matches remain `warning` unless the literal exactly matches a provenance-backed historical address.

## 7. Confidence

```ts
type ScanConfidence =
  | "structured"
  | "contextual"
  | "heuristic";
```

- `structured`: parsed exact key or known schema.
- `contextual`: generic key under explicit JPYC object/path.
- `heuristic`: text assignment inferred from line context.

Report confidence separately from severity.

## 8. Pairing logic

Preferred order:

1. explicit `JpycApplicationConfigV1` object;
2. same structured object;
3. same JPYC parent object;
4. exact `.env` key pair in same file;
5. no pair — validate field independently and emit limited warning.

Do not pair arbitrary values across unrelated files.

## 9. Finding locations

Use:

- normalized relative file path;
- 1-based line/column if known;
- JSON pointer/object path where applicable;
- no source line excerpt by default.

Safe example:

```text
ERROR JPYC-SCAN-003 config/payments.yml:12:5 /jpyc/tokenContract
JPYC chain/contract pair does not match jpyc-official-mainnet@2026-09-02.
Observed contract: 0x1234…abcd
```

## 10. Redaction

The scanner may encounter secrets adjacent to public contract addresses.

Mandatory behavior:

- never print the entire matched line;
- never print all key/value pairs in an object;
- never report values from keys containing `PRIVATE`, `SECRET`, `MNEMONIC`, `SEED`, `PASSWORD`, `TOKEN` unless the recognized field is specifically the JPYC public token contract key;
- shorten EVM addresses;
- report chain ID as public metadata;
- avoid stack traces with file content.

`JPYC_TOKEN_ADDRESS` is public configuration despite containing the word TOKEN. Exact recognized key handling is allowed; generic API tokens are not.

## 11. File errors

- Unreadable file: user-visible warning or application error depending on explicit vs discovered path.
- Unsupported/binary/oversized discovered file: info and continue.
- Explicit input path missing: exit code 2.
- Malformed structured file explicitly targeted: exit code 2 or scan finding according to command mode; choose one behavior and test it consistently.

Recommended: malformed discovered files produce warning; malformed explicitly listed files produce input error.

## 12. No execution guarantee

Forbidden scanner techniques:

- `require()` / dynamic `import()` customer files
- evaluating JS/TS expressions
- shelling out to project scripts
- reading process secrets for interpolation
- contacting RPC or block explorers

## 13. Scan report

`ScanReportV1` may reuse `ValidationReportV1` concepts but includes:

- scanned file count
- skipped file count
- candidate count by confidence
- findings with source location

No report field contains raw source snippets.

## 14. Acceptance tests

- Correct structured JSON pair passes.
- Unsupported structured chain fails.
- Non-current structured contract fails.
- Generic unrelated `chainId` does not warn.
- JPYC-prefixed TS assignment warns/fails according to confidence.
- `.env` secret values are absent from output.
- Symlink is not followed by default.
- Binary and oversized files are skipped safely.
- File traversal order does not alter report order.
