# Security Policy

## Supported versions

Security fixes are currently provided only for the latest published `0.1.x` alpha. Until the first
npm publication, the `main` branch is the only maintained development line.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/inthecradle/payoutjp/security/advisories/new)
for security or privacy issues. Do not include vulnerability details in a public issue.

Never submit real bank account numbers, account-holder names, recipient records, credentials,
private keys, seed phrases, or customer files. Replace them with minimal synthetic examples.

If the private report form is unavailable, contact the repository owner through a private contact
method listed on their GitHub profile and ask for a secure reporting channel without disclosing the
issue details publicly.

We aim to acknowledge a report within five business days and provide a status update within ten
business days. Timelines for a fix or disclosure depend on severity and reproducibility.

## Scope

Reports about redaction failures, unintended network access, unsafe artifact loading, dependency
confusion, package integrity, or ways to cross the no-money-movement boundary are especially useful.

PayoutJP is a compatibility validator. It must not receive payment credentials or production payout
data as part of a vulnerability report.
