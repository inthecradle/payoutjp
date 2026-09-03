# ADR-001 — Local-first Validation

- Status: Accepted
- Date: 2026-09-02

## Context

A hosted API would add uptime, security review, customer-data handling, infrastructure, and incident response. Bank destination data is sensitive, and JPYC configuration can be validated from local versioned data.

## Decision

All v0.1 validation runs locally in a library, CLI, or GitHub runner. No telemetry and no runtime remote Registry fetch are allowed.

## Consequences

Positive:

- lower operational burden;
- no central customer-data store;
- reproducible results;
- easier security story;
- no API cost or uptime dependency.

Negative:

- update distribution must be package/data-pack based;
- usage analytics are not automatic;
- customers must upgrade or pin versions explicitly.

## Revisit trigger

Only after demonstrated use cases show that a hosted service is necessary and can preserve the project's regulatory and privacy boundaries.
