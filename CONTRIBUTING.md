# Contributing to PayoutJP

Thank you for helping improve PayoutJP.

## Before opening an issue

- Do not submit real payout, bank-account, account-holder, wallet, credential, or customer data.
- Use fictional fixtures with clearly synthetic identifiers.
- Send security and privacy issues through the private process in [SECURITY.md](./SECURITY.md).
- Keep product claims within the limits documented in the README.

## Development

PayoutJP requires Node.js 24 and pnpm 11.25.0 through Corepack.

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm verify
```

Run `pnpm release:check` when changing public exports, package metadata, the CLI, or release files.

## Pull requests

- Keep changes focused and explain externally visible behavior changes.
- Add runtime validation for untrusted input.
- Add tests for normal, boundary, invalid, deterministic, and redaction behavior as applicable.
- Do not add network calls to validation paths.
- Do not implement transfer execution, account verification, custody, RPC access, telemetry, or
  automatic correction of payout destination data.

Unless explicitly marked otherwise, a contribution intentionally submitted for inclusion is
provided under Apache License 2.0 as described in [LICENSE](./LICENSE).
