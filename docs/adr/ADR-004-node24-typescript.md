# ADR-004 — Node.js 24 and TypeScript Workspace

- Status: Accepted
- Date: 2026-09-02

## Context

The target users are developer teams using GitHub and frequently TypeScript/Node.js. GitHub JavaScript Actions support a Node.js 24 runtime. One language minimizes maintenance and makes local CLI/library/action reuse practical.

## Decision

- Node.js 24
- TypeScript strict mode
- ESM packages
- pnpm workspace
- Vitest
- Biome
- JavaScript Action using `node24`

## Consequences

- first release does not include Python/Ruby/Go SDKs;
- package boundaries support one shared domain implementation;
- Action runtime and local minimum runtime align;
- GHES environments without Node.js 24 action support may be unsupported initially.

## Revisit trigger

A supported integration requires another runtime and its maintenance impact is acceptable.
