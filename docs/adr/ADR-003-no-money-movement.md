# ADR-003 — No Money Movement, Custody, or Account Verification

- Status: Accepted
- Date: 2026-09-02

## Context

The product idea is to extend bank destination compatibility checks to JPYC, not to create a transfer service. Payment execution, bank connectivity, wallet signing, custody, and account verification would materially increase regulation, security risk, support, and owner workload.

## Decision

PayoutJP performs static compatibility checks only.

Forbidden capabilities include:

- bank payment instruction transmission;
- bank credential/API access;
- account existence or holder verification;
- JPYC transaction construction, signing, broadcasting;
- RPC/balance/receipt calls;
- private-key or asset custody;
- fiat/JPYC exchange or mediation.

## Consequences

- reports must use “compatible with selected profile,” not “verified” or “safe to send”;
- JPYC implementation is address/chain/configuration validation only;
- some customers seeking end-to-end payout execution are not target customers;
- legal review is still required before commercialization.

## Revisit trigger

None for the current business. A money-movement product would be a separate project and business model.
