# 07 — Registries and Compatibility Profiles

## 1. Why separate them

```text
Rule implementation = reusable logic
Profile             = which rules and parameters apply
Registry            = versioned reference facts/data
```

This prevents service-specific constraints and changing bank/token data from becoming hard-coded universal logic.

## 2. Version model

### Packages

Semantic versioning, e.g. `@payoutjp/core@0.1.0`.

### Profiles

Independent immutable version, e.g.:

```text
bank-generic-jp@0.1.0
jpyc-current-mainnet@2026.09.02
```

### Registries

Date-based or source-version-based immutable version, e.g.:

```text
jpyc-official-mainnet@2026-09-02
banks-synthetic@2026-09-02
```

A Profile pins Registry ID, version, and SHA-256 digest.

## 3. JPYC official Registry snapshot

Verified from the official JPYC GitHub organization on 2026-09-02.

| Network | Chain ID | Current contract |
|---|---:|---|
| Ethereum | 1 | `0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29` |
| Avalanche C-Chain | 43114 | `0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29` |
| Polygon | 137 | `0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29` |
| Kaia | 8217 | `0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29` |

Official source states that these addresses differ from prepaid JPYC and that prepaid JPYC is outside the official current project scope.

Suggested registry file:

```json
{
  "schemaVersion": "1",
  "id": "jpyc-official-mainnet",
  "version": "2026-09-02",
  "kind": "jpyc-contracts",
  "sha256": "<generated>",
  "source": {
    "publisher": "JPYC Inc.",
    "uri": "https://github.com/jpycoin",
    "retrievedAt": "2026-09-02",
    "notes": [
      "Current regulated JPYC only; prepaid JPYC is outside this allowlist."
    ]
  },
  "payload": {
    "kind": "jpyc-contracts",
    "entries": [
      {
        "environment": "mainnet",
        "network": "Ethereum",
        "chainId": 1,
        "contractAddress": "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
        "status": "current",
        "product": "regulated-jpyc",
        "provenance": "official"
      }
    ]
  }
}
```

The implementation adds all four entries and calculates the real digest.

## 4. JPYC current Profile

`jpyc-current-mainnet@2026.09.02`

Required rules:

- `JPYC-ADDRESS-001`
- `JPYC-ADDRESS-002`
- `JPYC-ADDRESS-003`
- `JPYC-ADDRESS-004`
- `JPYC-CHAIN-001`
- `JPYC-CHAIN-002`
- `JPYC-ENV-001`
- `JPYC-CONTRACT-002` when application config is provided or required

Profile behavior:

- mainnet only;
- chain support entirely registry-driven;
- current contract must exactly match normalized address;
- checksum issue is warning;
- no symbol/decimals/on-chain verification.

## 5. Historical/prepaid JPYC handling

Do not ship an unverified denylist.

Base behavior:

```text
configured contract != current official contract
=> JPYC-CONTRACT-002 current contract mismatch
```

Specialized behavior:

```text
configured contract appears in provenance-backed historical Registry
=> JPYC-CONTRACT-003 historical/prepaid contract detected
```

A third-party explorer or random repository alone is not enough to mark an address as verified historical in a production pack. Record source and review decision.

## 6. Bank Registry status

### Development and tests

Use a synthetic Registry containing fictional codes and branches, for example:

```json
{
  "code": "1234",
  "name": "Sample Bank",
  "branches": [
    { "code": "001", "name": "Main Branch", "status": "active" },
    { "code": "002", "name": "East Branch", "status": "active" }
  ]
}
```

This allows full implementation and testing without making claims about real institutions.

The checked-in M2 assets are:

- `fixtures/bank/registry/banks-synthetic.json`, whose provenance explicitly labels every entry as
  fictional;
- `fixtures/bank/profiles/bank-synthetic-test.json`, which pins that Registry digest and exercises
  Registry, character-set, and UTF-8 byte-limit rules;
- `fixtures/bank/destinations/valid-synthetic.json`, a fictional integration destination.

Registry status is preserved as metadata. Until a closure-policy rule is specified, existence and
ownership checks treat `active`, `closed`, `unknown`, and omitted status entries as present rather
than inventing operational acceptance semantics.

### Production launch blocker

The production source must satisfy:

- lawful commercial reuse;
- clear update provenance;
- reliable bank-branch relationship;
- closure/rename/update handling;
- repeatable snapshot generation;
- attribution requirements compatible with packaging;
- acceptable accuracy and update cadence.

ZenginCode is a useful open-source candidate and is MIT-licensed at repository level, but its README acknowledges another upstream source. Do not assume that this alone resolves data rights, authority, or operational accuracy for a released data pack.

## 7. Bank profiles

### 7.1 `bank-generic-jp@0.1.0`

Status: `verified` only for conservative structural behavior.

Suggested parameters:

```yaml
bankCode:
  asciiDigits: 4
branchCode:
  asciiDigits: 3
accountNumber:
  asciiDigitsOnly: true
  minDigits: 1
  maxDigits: 7
accountHolder:
  required: true
  rejectControlCharacters: true
  unicodeNormalization: NFC
  normalizationSeverity: warning
```

This Profile does not claim acceptance by every bank. Registry existence rules are enabled only when an approved Registry is supplied.

The bundled implementation therefore enables only syntax, account-type, account-number,
presence/whitespace/control-character, and NFC-difference checks. It does not pin a Registry or
declare a universal account-holder character set or byte maximum.

The reusable character-set rule accepts an exact Profile-declared Unicode character set. The
encoded-length rule supports UTF-8 in the authorized M2 subset. CP932/Shift-JIS and other
provider-specific encoding claims remain deferred with the experimental Profile work.

### 7.2 `zengin-fb-draft@0.1.0-experimental`

Status: `experimental`.

Purpose: exercise profile-driven charset/byte-length mechanisms against an explicitly documented draft. It is not a launch-ready universal Zengin guarantee.

All exact character and byte parameters must cite their chosen source in `sourceNotes`.
Implementations must not invent missing values.

### 7.3 `yucho-transfer-draft@0.1.0-experimental`

Status: `experimental`.

Purpose: validate already-converted transfer bank fields and detect obvious mixing of symbol-number style input. v0.1 does not perform symbol-number conversion.

## 8. Profile overrides

Customer-local profiles may extend bundled profiles:

```yaml
schemaVersion: "1"
id: acme-bank-payout
version: 1.0.0
status: verified
rail: bank_transfer
extends: bank-generic-jp@0.1.0
rules:
  - id: BANK-NUMBER-002
    enabled: true
    params:
      minDigits: 7
      maxDigits: 7
```

Rules:

- extension is resolved before validation;
- cycles are rejected;
- unknown rule IDs and params are rejected;
- resulting Profile is materialized and digestable;
- customer-local status does not imply PayoutJP certification.

Profile inheritance may be deferred until after basic exact profiles if it threatens M1 scope. The schema should not block future addition.

## 9. Update workflow

Validation itself never fetches data.

A future explicit maintenance workflow may:

1. fetch or import source data;
2. normalize to internal schema;
3. compare with previous snapshot;
4. run integrity and regression tests;
5. require review for destructive changes;
6. generate immutable version and digest;
7. release the data pack.

MVP may implement only steps 2–6 using checked-in source fixtures.

## 10. Registry integrity checks

- duplicate bank codes: error
- duplicate branch code within a bank: error
- duplicate JPYC chain/environment current entry: error
- invalid address in Registry: error
- current JPYC entry not official provenance: error
- historical entry without source metadata: error
- same `id/version` with changed digest: error
- entries sorted canonically before digest generation

## 11. Staleness

Registry age is metadata, not automatic invalidity unless the Profile configures a maximum age.

For current JPYC data, a report should show the exact snapshot version. A future update can mark the Profile deprecated without silently changing past results.
