# 05 — Data Contracts

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

```ts
export interface SingleValidationRequestV1 {
  schemaVersion: "1";
  profileId: string;
  destination: BankTransferDestinationV1 | JpycDestinationV1;
  applicationConfig?: JpycApplicationConfigV1;
}
```

### 4.2 Batch manifest

```ts
export interface BatchValidationItemV1 {
  id?: string;
  profileId: string;
  destination: BankTransferDestinationV1 | JpycDestinationV1;
  applicationConfig?: JpycApplicationConfigV1;
}

export interface BatchValidationRequestV1 {
  schemaVersion: "1";
  items: BatchValidationItemV1[];
}
```

Mixed rails are allowed only in JSON/YAML batch manifests. CSV is single rail/profile in v0.1.

## 5. Canonical CSV

### Bank CSV headers

```csv
id,bankCode,branchCode,accountType,accountNumber,accountHolder
recipient-001,1234,001,ordinary,0123456,カ）サンプル
```

### JPYC CSV headers

```csv
id,chainId,walletAddress,tokenContract
recipient-002,137,0x1111111111111111111111111111111111111111,0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29
```

CLI flags supply `--rail` and `--profile`. `tokenContract` maps to optional application configuration. Unknown headers are rejected by default; a future lenient mode is not part of v0.1.

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

## 14. Sort order

Canonical finding order:

1. item index ascending
2. severity rank: error, warning, info
3. rule ID ascending
4. path ascending
5. file ascending
6. line/column ascending

Profiles and Registry references are sorted by `id`, then `version`.
