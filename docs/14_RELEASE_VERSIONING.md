# 14 — Release and Versioning

## 1. Release principle

A validation tool is useful only when past results can be reproduced. Code, Profiles, Registries, rule behavior, and action bundles must therefore be independently traceable.

## 2. Package versioning

Use Semantic Versioning.

- patch: bug fix that does not intentionally change accepted/rejected inputs, or documentation/build fix;
- minor: backward-compatible API/capability addition, new optional rule/Profile;
- major: breaking public API, schema, CLI, or default behavior change.

Before `1.0.0`, breaking changes may occur in minors but must still be documented and migration-tested.

## 3. Data contract versioning

Top-level `schemaVersion` changes only for incompatible serialized contract changes.

- Additive optional field: can remain version `1`.
- Required field or semantic reinterpretation: new schema version.
- Readers reject unknown major schema versions.

## 4. Rule IDs

- Released rule ID is never reused for a different meaning.
- Message wording may improve without changing rule ID if machine semantics stay the same.
- Severity default change is behaviorally significant and appears in release notes.
- Profile override does not change base rule identity.

## 5. Profile versioning

Profiles are immutable.

Examples:

```text
bank-generic-jp@0.1.0
bank-generic-jp@0.2.0
jpyc-current-mainnet@2026.09.02
```

Recommended:

- semantic versions for rule-parameter profiles;
- date versions for external current-state snapshots/profiles closely tied to dated Registry data.

A new Profile version is required when enabled rules, severities, parameters, or Registry references change.

## 6. Registry versioning

- Immutable ID/version/digest.
- Prefer source release/date if available.
- Same ID/version with different digest is a fatal integrity event.
- Old snapshots remain available where license permits reproducibility.
- Registry updates do not silently replace the version pinned by a Profile.

## 7. JPYC updates

When official JPYC chain/contract information changes:

1. create a new Registry snapshot;
2. preserve old snapshot;
3. create/update Profile version;
4. add migration warning if old Profile is deprecated;
5. add fixture for old and new behavior;
6. document official source and retrieval date.

Do not mutate `jpyc-official-mainnet@2026-09-02`.

## 8. Bank data updates

Production procedure is blocked until data source is approved. Once approved:

- normalize source into internal schema;
- detect bank/branch additions, closures, renames, and relation changes;
- require review for deletions and code reuse;
- publish immutable snapshot and diff summary;
- do not infer account validity from directory presence.

## 9. CLI compatibility

- Existing command names and exit-code meanings are stable within a major.
- Machine-readable JSON takes precedence over exact human text stability.
- New findings may change exit result only through an explicitly selected newer Profile/Registry or documented package release behavior.
- `--experimental` is always opt-in.

## 10. GitHub Action releases

Suggested tags:

```text
v0.1.0
v0.1
v0
```

- immutable full version tag/release;
- moving minor/major tags updated deliberately;
- action bundle built and verified in release workflow;
- release notes state CLI/core/Profile/Registry versions included;
- Node runtime shown in metadata.

Do not publish action to Marketplace before RC security/privacy review.

## 11. Release artifacts

Potential artifacts:

- npm packages
- GitHub Action source/bundle
- Profile/Registry JSON pack
- checksums
- changelog
- SBOM or dependency manifest before public launch

MVP may produce local tarballs with `pnpm pack` instead of publishing.

## 12. RC checklist

- [ ] `pnpm verify` passes from clean clone.
- [ ] consumer tests pass on packed packages.
- [ ] action bundle is current.
- [ ] all P0 rule docs and tests align.
- [ ] canonical reports are deterministic.
- [ ] no-network guard passes.
- [ ] redaction tests pass in every renderer.
- [ ] JPYC official source/date reviewed.
- [ ] bank production Registry is either approved or clearly unavailable in the RC.
- [ ] experimental Profiles are opt-in.
- [ ] product disclaimer is present.
- [ ] open-source/commercial licenses decided before external distribution.
- [ ] legal/product-claim review completed before sale.

## 13. Rollback

Because validation is local and versioned, rollback means pinning previous package/Profile/Registry versions. Never require a central service rollback for normal operation.
