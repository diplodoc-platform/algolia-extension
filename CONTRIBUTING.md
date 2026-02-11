# Contributing to @diplodoc/algolia-extension

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Prerequisites

- **Node.js**: >= 22
- **npm**: >= 11.5.1
- **Git**

## Development Workflow

1. **Fork and clone** the repository.
2. **Install dependencies**: `npm install`
3. **Build**: `npm run build`
4. **Type check**: `npm run typecheck`
5. **Run tests**: `npm test`
6. **Lint**: `npm run lint` / `npm run lint:fix`

## Code Style and Commits

- Follow the code style enforced by ESLint and Prettier (configured via `@diplodoc/lint`).
- Use **Conventional Commits** for commit messages (e.g. `feat: add X`, `fix: Y`).
- Do **not** commit with `--no-verify`; pre-commit hooks must pass.

## Pull Requests

- Open a PR against `master`.
- Ensure CI (typecheck, lint, test, build) passes.
- Keep changes focused and documented as needed.

## Testing

Tests use **Vitest**. Run `npm test` or `npm run test:watch`. Coverage: `npm run test:coverage`.

For more details, see the [Diplodoc metapackage documentation](https://github.com/diplodoc-platform/diplodoc) and `.agents/` in the metapackage root.
