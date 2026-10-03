# Security Policy

## Supported versions

Security fixes are provided for the latest published `0.1.x` alpha and developed on `main`.
The latest published alpha is `0.1.0-alpha.2`, available under the npm `alpha` tag.

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

For CSV/privacy reports, use synthetic values even when reproducing a wrong column mapping, an
invalid field, or an input ID. Input IDs are report-visible metadata when explicitly enabled.
For report-write issues, include synthetic file layouts and whether aliases or an existing report
were involved; omit source rows and sensitive file names.
