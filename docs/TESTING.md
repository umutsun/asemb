# Testing Guide

This project uses Jest + ts-jest for unit tests. Integration points to external services (OpenAI, Redis, Postgres, n8n runtime) are mocked in tests to keep them fast and deterministic.

## Commands

- Run all tests: `npm test`
- Watch mode: `npm run test:watch`
- Unit-only (shared utils): `npm run test:unit`
- Coverage report: `npm run test:coverage` (outputs HTML under `coverage/`)

CI runs `test:unit` with coverage and uploads it as an artifact.

## Structure

- Tests live under `test/` mirroring `shared/`, `nodes/`, `src/shared/` where practical.
- Use `test/helpers/n8nStubs.ts` to stub `IExecuteFunctions` when testing n8n nodes.

## Mocking External Services

- OpenAI SDK: `jest.mock('openai')` and inject a fake client on the service instance.
- Redis: prefer mocking the cache layer rather than connecting to a real Redis. When unavoidable, stub `ioredis` methods (`get`, `set`, `keys`, etc.).
- Postgres: test SQL construction and result shaping by mocking `pg.Pool` methods (`query`). Avoid hitting a real database in unit tests.

## Writing Focused Tests

- Pure utils (e.g., `shared/chunk.ts`, `shared/robots.ts`) should have comprehensive unit tests.
- Service classes (e.g., `shared/embedding-service.ts`) should validate retry/backoff, caching usage, and input/output shape via mocks.
- Node implementations should be tested with `n8n` stubs to verify parameters mapping and output formatting.

## Tips

- Use Jest fake timers for retry/backoff logic to avoid slow tests.
- Keep network access disabled; if a test requires it, it’s likely an integration test and should be adjusted or skipped.
- Aim for 70%+ line/function coverage on core shared utilities. CI enforces thresholds to prevent regressions.
