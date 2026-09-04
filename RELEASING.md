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

## Preflight

1. Confirm the release commit is on `main` and the worktree is clean.
2. Confirm the maintainer controls the `@payoutjp` npm scope and can publish all three names.
3. Confirm npm authentication, required two-factor authentication, and the `alpha` dist-tag.
4. Confirm GitHub private vulnerability reporting is enabled for the repository.
5. Run `pnpm install --frozen-lockfile` with Node.js 24 and pnpm 11.25.0.
6. Run `pnpm release:check`.
7. Review package manifests, tarball file lists, licenses, README, CHANGELOG, and the release diff.

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

Verify the installed CLI from a clean directory before creating the immutable
`v0.1.0-alpha.1` tag and GitHub Release. Do not create moving `v0` or `v0.1` tags for this CLI-only
alpha; those tags are reserved for a future dedicated Action release.

## Rollback

npm versions are immutable. If a package is defective, deprecate it with a factual reason, publish a
new version, and document the change. Never replace a released Profile or Registry snapshot in
place.
