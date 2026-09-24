# Reproduce the isolated QA run

See [the full Hebrew report](../../QA_REPORT.md). All telephony in this run is simulated. Do not replace the wrapper with production environment variables.

Prerequisites: repository dependencies installed, Node 20, local PostgreSQL or the optional embedded runtime below, Playwright Chromium. The wrapper uses only `127.0.0.1:55439/dialer_qa`, mock telephony, generated local signing keys and synthetic accounts. `.qa-local/` is ignored by Git.

Start disposable PostgreSQL in a separate terminal:

```sh
npm install --prefix .qa-local/postgres embedded-postgres@18.4.0-beta.17
LC_ALL=C LANG=C TZ=Asia/Jerusalem node scripts/qa-postgres.mjs
```

Initialize and run the isolated app (port 3107):

```sh
node scripts/qa-local.cjs npm run db:deploy
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-reset.ts
node scripts/qa-local.cjs npm run dev -- --hostname 127.0.0.1 --port 3107
```

In another terminal, execute suites **sequentially**. The reset deletes and recreates only the `demo` and `qa-b` fixtures in the guarded local database. The regression, provider, resilience and load suites create their own synthetic organizations.

```sh
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-api.ts
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-reset.ts
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-ui.ts
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-regression.ts
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-provider.ts
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-ui-resilience.ts
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-load.ts
node scripts/qa-local.cjs npm run build -- --webpack
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-restart.ts
npm run typecheck
npm run lint
```

If Chromium is absent, install it with `npx playwright install chromium` first. Build output is isolated at `.qa-local/next`; the restart test owns its server at port 3117 and stops it in `finally`. Stop the QA dev/PostgreSQL terminals with Ctrl-C when done. Do not stop unrelated app processes.

Outputs: root `qa-results-api.json` and `qa-results-ui.json`, other results under `.qa-local/`, screenshots `.qa-local/shots`. This dated folder preserves selected results from the actual run. Keys, cookies and environment files are excluded. The API script's older N20 grouping is corrected in the report: listen/whisper exist; hold, live transfer and barge-in do not. Raw source results are retained rather than rewritten as if the script verified unsupported capabilities.

Fault tests intentionally produce a PostgreSQL exception to verify rollback and event redelivery; see final PASS rows. Baseline failures are evidence of pre-fix behavior, not the final result. Load latencies measure local HTTP API calls, not actual provider capacity or audio quality. Screenshots of listen/whisper show UI behavior only.
