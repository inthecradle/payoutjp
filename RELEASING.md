# Releasing PayoutJP

Releases are deliberate maintainer operations. No repository script publishes packages, creates a
Git tag, or creates a GitHub Release.

## First alpha scope

The `0.1.0-alpha.1` npm set contains only:

- `@payoutjp/core`
- `@payoutjp/bank`
- `@payoutjp/cli`

The workspace root and JPYC, Scanner, and Action packages remain private. No production Bank
Registry is included.

## Current alpha

`0.1.0-alpha.2` is published for Core/Bank/CLI under the npm `alpha` tag. The Registry consumer
and artifact checksums are verified. Changes and migration notes are recorded in
[CHANGELOG.md](./CHANGELOG.md) and the [release notes](./docs/releases/0.1.0-alpha.2.md).
Future publishes remain separate maintainer operations. Never reuse a released version or tag.

## GitHub review preparation

1. Prepare a feature branch and focused commit in the public product repository. Keep private
   planning, commercial evidence, and internal approval documents in the private repository.
2. Prepare a PR description covering batch behavior, privacy/output changes, migration, validation,
   and remaining checks. Local branch/commit preparation does not publish packages or tags.
3. After pushing and opening the PR, confirm `pnpm verify` passes on Ubuntu/macOS/Windows, plus
   the Linux benchmark and packed-consumer release check. Record the actual runs before marking
   cross-platform verification complete.
4. Review and merge the product PR, and separately review the private planning update. Confirm
   unpublished candidate wording until the maintainer explicitly starts the release.

## Preflight

1. Confirm the release commit is on `main` and the worktree is clean.
2. Confirm the maintainer controls the `@payoutjp` npm scope and can publish all three names.
3. Confirm npm authentication, required two-factor authentication, and the `alpha` dist-tag.
4. Confirm GitHub private vulnerability reporting is enabled for the repository.
5. Run `pnpm install --frozen-lockfile` with Node.js 24 and pnpm 11.25.0.
6. Run `pnpm release:check`.
7. Review package manifests, tarball file lists, licenses, README, CHANGELOG, and the release diff.
8. Confirm successful CI on all three operating systems for the release commit.
9. When release is authorized, move Unreleased notes into a version/date section and update source
   and package README availability statements to the actual published state.

`release:check` packs into an operating-system temporary directory, installs the three tarballs into
a clean temporary consumer with exact external dependency overrides, verifies public imports,
executes the packaged CLI, and removes the temporary directory. Dependency installation may access
the npm Registry; validation execution remains local and no-network. The check does not publish or
tag. It also fails when the production dependency audit reports a known vulnerability.

## Publish order

After the preflight succeeds, publish with the `alpha` dist-tag in dependency order:

```sh
pnpm --filter @payoutjp/core publish --access public --tag alpha
pnpm --filter @payoutjp/bank publish --access public --tag alpha
pnpm --filter @payoutjp/cli publish --access public --tag alpha
```

Verify the installed CLI from a clean directory before creating the immutable full-version tag
(alpha.2: `v0.1.0-alpha.2`) and GitHub Release. Do not create moving `v0` or `v0.1` tags for
this CLI-only alpha; those tags are reserved for a future dedicated Action release.

## Rollback

npm versions are immutable. If a package is defective, deprecate it with a factual reason, publish a
new version, and document the change. Never replace a released Profile or Registry snapshot in
place.
