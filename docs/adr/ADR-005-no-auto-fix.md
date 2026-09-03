# ADR-005 — No Automatic Mutation of Payout Destinations

- Status: Accepted
- Date: 2026-09-02

## Context

Changing account-holder characters, width, abbreviations, leading zeros, or wallet casing can alter meaning or produce a value that no longer matches the recipient's registered information. Different Profiles can require opposite transformations.

## Decision

v0.1 provides findings and remediation guidance but no `--fix` command and no automatic write-back.

## Consequences

- lower risk of corrupting payout data;
- users must confirm sensitive corrections against their bank/service/source of truth;
- suggestions avoid full replacement values when they would expose sensitive data;
- future auto-fix requires a new ADR and field-by-field safety analysis.
