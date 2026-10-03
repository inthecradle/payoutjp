# 05 — Data Contracts

> **Source alpha.2 contract:** Bank JSON/CSV audit uses one Profile and the existing report v1.
> Row schema issues become `INPUT-SCHEMA-001` errors with safe source locations; document/configuration
> errors abort the command. JPYC library contracts are implemented, but JPYC CLI/CSV, YAML destination
> input, and mixed-rail batches remain deferred. See the [Bank CSV guide](./PRACTICAL_BANK_CLI.md).

> **Scope note:** These are candidate validation contracts. A cross-snapshot Registry change-impact
> workflow is not specified here; its request shape, change taxonomy, join keys, stable IDs,
> redaction policy, and report contract must be designed before implementation.

This document defines the v0.1 canonical contracts. Runtime schemas are the source of truth; TypeScript types are inferred from them where possible.

## 1. Common enums

```ts
export type SchemaVersion = "1";
export type Severity = "error" | "warning" | "info";
export type ItemStatus = "PASS" | "WARNING" | "FAIL";
export type ProfileStatus =
  | "verified"
  | "experimental"
  | "deprecated"
  | "retired";

export type Rail = "bank_transfer" | "jpyc";
```

## 2. Destination contracts

### 2.1 Bank transfer

```ts
export type BankAccountType =
  | "ordinary"
  | "checking"
  | "savings"
  | "other";

export interface BankTransferDestinationV1 {
  schemaVersion: "1";
  rail: "bank_transfer";
  id?: string;
  bankCode: string;
  branchCode: string;
  accountType: BankAccountType;
  accountNumber: string;
  accountHolder: string;
}
```

Rules:

- Code/number fields remain strings to preserve leading zeros.
- Runtime schema checks shape, not compatibility.
- Empty or malformed values become findings or schema errors according to rule responsibility.

Example:

```json
{
  "schemaVersion": "1",
  "rail": "bank_transfer",
  "id": "recipient-001",
  "bankCode": "1234",
  "branchCode": "001",
  "accountType": "ordinary",
  "accountNumber": "0123456",
  "accountHolder": "カ）サンプル"
}
```

### 2.2 JPYC

```ts
export interface JpycDestinationV1 {
  schemaVersion: "1";
  rail: "jpyc";
  id?: string;
  chainId: number;
  walletAddress: string;
}
```

Example:

```json
{
  "schemaVersion": "1",
  "rail": "jpyc",
  "id": "recipient-002",
  "chainId": 137,
  "walletAddress": "0x1111111111111111111111111111111111111111"
}
```

The example address is a fixture, not a recommended recipient.

## 3. Application configuration

```ts
export interface JpycApplicationConfigV1 {
  schemaVersion: "1";
  kind: "jpyc";
  environment: "mainnet" | "testnet";
  chainId: number;
  tokenContract: string;
}
```

The runtime shape represents both environments so compatibility remains Profile-driven. The
verified `jpyc-current-mainnet` Profile accepts only `mainnet`; `testnet` is rejected by
`JPYC-ENV-001`. This contains no RPC URL, private key, signer, gas settings, or transaction
configuration.

## 4. Validation request

### 4.1 Single item

The shared design below includes JPYC library inputs. The implemented Bank CLI wrapper requires
`schemaVersion`, `profileId`, and a Bank `destination` only; `applicationConfig` and unknown wrapper
keys are rejected. A bare Bank destination is accepted with explicit CLI `--profile`.

```ts
export interface SingleValidationRequestV1 {
  schemaVersion: "1";
  profileId: string;
  destination: BankTransferDestinationV1 | JpycDestinationV1;
  applicationConfig?: JpycApplicationConfigV1;
}
```

### 4.2 Implemented Bank audit manifest

```ts
export interface BatchValidationItemV1 {
  id?: string;
  profileId?: string;
  destination: BankTransferDestinationV1;
}

export interface BatchValidationRequestV1 {
  schemaVersion: "1";
  items: BatchValidationItemV1[];
}
```

This is the successful item shape. The CLI accepts each raw item as `unknown` so malformed items
can produce schema findings without discarding the batch. `items` must contain 1–100,000 entries;
the top-level object and item wrappers reject unknown keys. All interpretable items resolve to one
Bank Profile. `profileId` may be omitted with CLI `--profile`; otherwise every interpretable item
must specify the same selector. Mixed rails/Profiles and `applicationConfig` are unsupported by audit.

IDs default to generated row-order identifiers regardless of supplied IDs. `--id-policy input`
requires non-sensitive, unique IDs of at most 128 characters; item/destination IDs must agree if
both exist. Invalid explicit IDs abort the batch. Malformed destination fields instead become
`INPUT-SCHEMA-001` findings. Generated IDs do not identify the same recipient after reordering.

## 5. Canonical CSV

### Bank CSV headers

```csv
id,bankCode,branchCode,accountType,accountNumber,accountHolder
recipient-001,1234,001,ordinary,0123456,カ）サンプル
```

Bank CSV accepts BOM, quoted multiline records, and CRLF/LF. Number fields stay strings without
trimming, coercion, or automatic padding. `id` is optional. Explicit JSON mappings can rename
columns, translate account-type values, and discard declared ignored columns; other unknown or
duplicate headers abort. Undefined mapped account types fail that row. Findings include the
physical record start line. Limits are 50 MiB input, 64 KiB CSV record, 8 KiB field, and
100,000 findings. Oversized inputs fail explicitly rather than producing a truncated success report.

### Deferred JPYC CSV design

```csv
id,chainId,walletAddress,tokenContract
recipient-002,137,0x1111111111111111111111111111111111111111,0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29
```

This JPYC CSV design is not accepted by the current CLI. A future adapter would need to define
application-configuration mapping explicitly. For implemented Bank CSV, `--profile` is required and
`--rail bank_transfer` is an optional assertion.

Encoding: UTF-8 only in v0.1. Shift-JIS/CP932 input support is future work and must be explicit rather than auto-detected.

## 6. Profile contract

```ts
export interface RuleConfigurationV1 {
  id: string;
  enabled: boolean;
  severity?: Severity;
  params?: Record<string, unknown>;
}

export interface RegistryReferenceV1 {
  id: string;
  version: string;
  sha256: string;
}

export interface CompatibilityProfileV1 {
  schemaVersion: "1";
  id: string;
  version: string;
  status: ProfileStatus;
  rail: Rail;
  title: string;
  description: string;
  rules: RuleConfigurationV1[];
  registries: RegistryReferenceV1[];
  sourceNotes?: string[];
}
```

Rule-specific parameters must be validated by that rule's own runtime schema. Unknown parameters cause a Profile configuration error, not silent ignore.

## 7. Registry envelope

```ts
export interface SourceMetadataV1 {
  publisher: string;
  uri: string;
  retrievedAt: string; // ISO date or date-time
  effectiveAsOf?: string;
  license?: string;
  notes?: string[];
}

export interface RegistryEnvelopeV1<TPayload> {
  schemaVersion: "1";
  id: string;
  version: string;
  kind: string;
  sha256: string;
  source: SourceMetadataV1;
  payload: TPayload;
}
```

Digest convention:

- `sha256` is calculated over canonical JSON of the envelope with the `sha256` field omitted.
- Canonicalization algorithm must be documented and tested.
- Same `id + version` cannot have different digest.

## 8. Bank Registry payload

```ts
export interface BankBranchEntryV1 {
  code: string;
  name?: string;
  kana?: string;
  status?: "active" | "closed" | "unknown";
}

export interface BankEntryV1 {
  code: string;
  name?: string;
  kana?: string;
  status?: "active" | "closed" | "unknown";
  branches: BankBranchEntryV1[];
}

export interface BankDirectoryRegistryV1 {
  kind: "bank-directory";
  banks: BankEntryV1[];
}
```

v0.1 tests use synthetic entries. Production names/codes must not be assumed licensed or authoritative until the data-source decision is closed.

## 9. JPYC Registry payload

```ts
export interface JpycContractEntryV1 {
  environment: "mainnet" | "testnet";
  network: string;
  chainId: number;
  contractAddress: string;
  status: "current" | "historical" | "deprecated";
  product: "regulated-jpyc" | "jpyc-prepaid" | "unknown";
  provenance: "official" | "verified-historical" | "third-party";
}

export interface JpycContractRegistryV1 {
  kind: "jpyc-contracts";
  entries: JpycContractEntryV1[];
}
```

Only `official` entries may define the current production allowlist. Historical specialization requires `verified-historical` or stronger provenance.

## 10. Finding contract

```ts
export interface FindingLocationV1 {
  file?: string;       // normalized relative path
  line?: number;       // 1-based
  column?: number;     // 1-based
  itemIndex?: number;  // 0-based batch index
  jsonPointer?: string;
}

export interface SafeObservedValueV1 {
  classification:
    | "public"
    | "masked-bank-account"
    | "redacted-account-holder"
    | "short-wallet-address"
    | "metadata-only";
  display: string;
}

export interface RemediationV1 {
  code: string;
  message: string;
}

export interface FindingV1 {
  schemaVersion: "1";
  ruleId: string;
  severity: Severity;
  messageKey: string;
  message: string;
  path: string;
  location?: FindingLocationV1;
  actual?: SafeObservedValueV1;
  expected?: string;
  remediation?: RemediationV1;
  profileId: string;
  profileVersion: string;
}
```

`actual.display` must never contain a raw account holder or full account number. Full wallet addresses are shortened in normal reports.
Bank/branch fields use metadata-only observations in source alpha.2, so incorrect column mappings
cannot expose a name or account number as a supposedly public code. Schema findings contain no
raw values or arbitrary unknown keys, and retain the selected Profile ID/version.
CSV uses `location.line`; JSON audit uses `location.jsonPointer` such as
`/items/0/destination/accountNumber`. Both retain zero-based `itemIndex`.

## 11. Item and report contracts

```ts
export interface ValidationItemReportV1 {
  id: string;
  index: number;
  rail: Rail;
  status: ItemStatus;
  findings: FindingV1[];
}

export interface ValidationSummaryV1 {
  totalItems: number;
  passedItems: number;
  warningItems: number;
  failedItems: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface ToolReferenceV1 {
  name: "payoutjp";
  version: string;
}

export interface ProfileReferenceV1 {
  id: string;
  version: string;
  status: ProfileStatus;
}

export interface ValidationReportV1 {
  schemaVersion: "1";
  tool: ToolReferenceV1;
  notices: string[];
  status: ItemStatus;
  profiles: ProfileReferenceV1[];
  registries: RegistryReferenceV1[];
  summary: ValidationSummaryV1;
  items: ValidationItemReportV1[];
}
```

Canonical report omits runtime timestamp and absolute paths to preserve deterministic comparison.
`notices` contains deterministic, non-sensitive safety or experimental-profile statements and is
part of the machine-readable output contract.

## 12. Rule interface

```ts
export interface RuleContextV1<TDestination, TParams> {
  destination: TDestination;
  applicationConfig?: unknown;
  profile: CompatibilityProfileV1;
  params: TParams;
  registries: ReadonlyMap<string, RegistryEnvelopeV1<unknown>>;
  itemIndex: number;
  itemId: string;
}

export interface RuleV1<TDestination, TParams> {
  readonly id: string;
  readonly defaultSeverity: Severity;
  parseParams(input: unknown): TParams;
  applies(context: RuleContextV1<unknown, unknown>): boolean;
  evaluate(
    context: RuleContextV1<TDestination, TParams>,
  ): readonly FindingV1[];
}
```

Exact generic shape may be refined during M1, but purity and dependency constraints are mandatory.

## 13. Config file

Default filename: `payoutjp.config.yml`

```yaml
version: 1
failOn: error
redaction: strict

paths:
  profiles:
    - ./profiles
  registries:
    - ./registries

scan:
  include:
    - "**/.env*"
    - "**/*.{json,yaml,yml,ts,tsx,js,jsx,mjs,cjs,toml}"
  exclude:
    - "**/.git/**"
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/coverage/**"
  maxFileBytes: 5242880
```

Unknown root keys are rejected to prevent misspelled security options from being ignored.
`scan` settings are accepted for shared-config compatibility but are inactive while Scanner is
deferred. `paths` load local JSON only; they do not fetch or update a Registry.

## 14. Sort order

Canonical finding order:

1. item index ascending
2. severity rank: error, warning, info
3. rule ID ascending
4. path ascending
5. file ascending
6. line/column ascending

Profiles and Registry references are sorted by `id`, then `version`.
