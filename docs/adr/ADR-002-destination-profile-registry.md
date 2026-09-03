# ADR-002 — Destination × Profile × Registry Model

- Status: Accepted
- Date: 2026-09-02

## Context

Japanese payout requirements vary by rail, provider, and version. Bank account-holder width/character rules are not universal. JPYC supported chain/contract information changes independently from rule code.

## Decision

Validation is modeled as:

```text
Destination × Compatibility Profile × Registry Snapshot
```

- Destination holds recipient-provided fields.
- Profile selects rules and parameters.
- Registry holds versioned external reference data.

## Consequences

- universal and provider-specific rules remain separate;
- past results are reproducible;
- customer-local Profiles are possible;
- implementation has more explicit data/version plumbing;
- missing/invalid Registry is a first-class error.

## Rejected alternatives

- hard-code all constraints in validators;
- infer provider behavior from data shape;
- silently use latest online data.
