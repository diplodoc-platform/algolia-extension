# AGENTS.md

Guide for AI coding agents working on `@diplodoc/algolia-extension`.

## Metapackage rules

This package follows Diplodoc metapackage requirements. When working in metapackage mode, also follow:

- `../../.agents/style-and-testing.md` — code style, Conventional Commits, testing, docs in English
- `../../.agents/monorepo.md` — workspace and dependency management
- `../../.agents/dev-infrastructure.md` — build, CI/CD
- `../../.agents/metapackage-requirements.md` — package checklist

## Package overview

`@diplodoc/algolia-extension` provides Algolia search integration for Diplodoc: indexing built docs, provider for `@diplodoc/search-extension`, document processing (sections, headings, record size).

## Structure

- `src/` — sources (client, config, core, types, workers)
- `dist/` — build output (tsc + copy of `src/client/search.js`)
- `test/` — Vitest specs (`*.spec.ts`)

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run test:watch  # vitest
npm run test:coverage
npm run lint        # lint update && lint
npm run build       # build:clean && tsc && cp search.js
```

## Testing

- **Vitest** only (no Jest). Config: `vitest.config.mjs`.
- Specs in `test/**/*.spec.ts`, coverage from `src/**`.
- Mocks: use `vi.mock()`, `vi.fn()`, `vi.mocked()` from `vitest`.

## Build

- **tsc** for JS and declarations into `dist/`.
- `build:clean` removes `dist/`; `build` runs clean, tsc, and copies `src/client/search.js` to `dist/client/`.
