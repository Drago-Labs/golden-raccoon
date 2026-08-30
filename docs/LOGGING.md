# Logging and Observability

This project uses structured server-side logging with correlation ids.

- Logs are emitted as JSON records with fields: `ts`, `level`, `correlationId`, `module`, `message`, and `fields`.
- A per-request correlation id is provided by `AsyncLocalStorage` and attached to records.
- Sensitive values such as wallet addresses, tokens, and URL query strings are redacted before emission.

Developer notes:
- Use the logger at `frontend/src/server/observability/logger/logger.ts`.
- To ensure no raw `console` calls are reintroduced in server code run: `npm run logging-check` from the `frontend` folder.
- Configure verbosity with `LOG_LEVEL` in your environment (default `info` in production).
