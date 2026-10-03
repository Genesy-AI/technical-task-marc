# TinyEnginy — Codebase Analysis & Roadmap

**Status:** Proposal · **Scope:** backend, frontend, infra · **Audience:** engineering + product

## 1. Summary

TinyEnginy works end to end: CSV import, email verification, message generation and phone enrichment. The phone enrichment flow (cascading providers on Temporal, status in the DB, UI polling) is the most solid part and a good model for the rest.

The main risks sit in the older code paths. All routes live in one file, there is almost no input validation outside the bulk import, email verification blocks the HTTP request, and there is no auth. The roadmap below fixes correctness bugs first, then moves the architecture toward what the product needs (scale, more providers, more fields).

**Top priority: provider rate limits.** The providers have announced limits on their endpoints. Today nothing in our code protects us when that happens, and the way we handle a 429 would silently mark leads as "not found" or "failed". This is covered in section 2.0 and is the first item of the roadmap.

## 2. Findings

### 2.0 Priority theme: provider rate limits

**What happens today**

- Every lead starts its own `enrichPhoneWorkflow`, and the route starts them in a loop with no cap. A selection of 5,000 leads sends about 5,000 requests to Orion Connect at the same moment. The worker default (100 concurrent activities) is the only brake, and it is not tied to any provider limit.
- A 429 is classed as retryable in `providers/phone/http.ts`, which is right. But the retry policy is 3 attempts with 1s and 2s backoff, and it ignores `Retry-After`. Under a limit, all three attempts fail within seconds.
- When the retries are exhausted, `enrichPhoneWorkflow` catches the `ActivityFailure` and moves to the next provider. Result: a lead that Orion would have found is sent to Astra (the worst data) only because we were throttled. If all three providers throttle us, the lead ends as `failed`; if some answer "no phone", it ends as `not_found`. Both are wrong and the user cannot tell them apart from a real miss.
- A throttled burst also burns the quota of the provider for the leads that come after it, and failed attempts probably count against the limit.
- The limits are unknown (RPS or RPM, per key or per IP), so the solution must be configurable per provider and not hardcoded.

**Proposed solution (in order)**

| Step | Pri | Effort | What |
|------|-----|--------|------|
| R1 | P0 | S | **Honour 429.** In `postJson`, read `Retry-After` and throw `ApplicationFailure.retryable(..., { nextRetryDelay })`. Do not count rate limiting as a provider failure for the cascade: use a separate, longer retry budget for it (for example up to 10 minutes with `maximumAttempts` unlimited and `scheduleToCloseTimeout` as the cap). Only after that fall through to the next provider. |
| R2 | P0 | S | **Distinguish outcomes.** Add a `rate_limited` / `provider_unavailable` reason instead of folding it into `failed` or `not_found`. The UI should show "Retrying later" and offer a re-run, not "No data found". |
| R3 | P0 | M | **Cap throughput per provider.** Move each provider's activities to its own task queue (`phone-orionConnect`, `phone-astraDialer`, `phone-nimbusLookup`) by passing `taskQueue` to `proxyActivities`. Run one worker per queue with `maxConcurrentActivityTaskExecutions` and `maxTaskQueueActivitiesPerSecond` taken from config. Temporal enforces the per-second cap on the server for the whole queue, so it holds even with several workers. Excess work waits in the queue (no `scheduleToStartTimeout`, so queued activities do not fail), and `startToCloseTimeout` only measures the call itself. |
| R4 | P1 | S | **Config per provider.** A `PROVIDER_LIMITS` entry next to `PROVIDER_TIMEOUT_MS` in `providers/phone/config.ts` (`maxRps`, `maxConcurrent`, `retryAfterCapMs`), overridable from env so we can change numbers the day the providers publish them without a deploy. |
| R5 | P1 | S | **Throttle the start loop.** `POST /leads/enrich-phone` should start workflows in bounded chunks, or hand the whole batch to one parent workflow that fans out with a concurrency limit. This keeps the API fast and avoids a spike of workflow starts. |
| R6 | P1 | M | **Adaptive limiting.** If a provider returns 429 often, lower its rate automatically (AIMD) and recover slowly. Alternative if we need a limit that Temporal's queue rate cannot express (per minute windows, shared quota across services): a token bucket in Redis, called at the start of the activity. |
| R7 | P2 | S | **Circuit breaker.** After N consecutive 5xx or 429, pause the provider for a short time and skip it in the cascade, so a provider that is down does not slow every lead by 3 attempts × timeout (for Orion that is up to about 24s per lead). |
| R8 | P2 | S | **Metrics and alerts.** Count requests, 429s, retries and queue backlog per provider, and alert when the backlog age grows or when 429s exceed a threshold. This also tells us the real limits. |
| R9 | P2 | S | **Tests.** Extend `enrichPhoneWorkflow.test.ts` and `providers.test.ts`: 429 with and without `Retry-After`, cascade not advancing on rate limiting, final status when all providers are limited. |

**Done when:** a 5,000-lead run never exceeds the configured rate of any provider, no lead is moved to a lower-quality provider because of a 429, and the UI tells the user the difference between "no data", "provider unavailable" and "waiting for quota".

### 2.1 Other findings

Priority: **P0** = bug or risk now, **P1** = needed soon, **P2** = quality / scale.
Effort: S ≤ 0.5d, M ≈ 1–3d, L > 3d.

### 2.1 Correctness bugs

| # | Pri | Effort | Finding | Where |
|---|-----|--------|---------|-------|
| B1 | P0 | S | The frontend calls `PUT /leads/:id` but the backend only exposes `PATCH`. Updating a lead fails. | `frontend/src/api/modules/leads.ts`, `backend/src/index.ts` |
| B2 | P0 | S | `PATCH /leads/:id` does `String(name)` and `String(email)` with no checks. A partial body writes the literal string `"undefined"` into the DB. It also cannot update `lastName` or the new fields, and it reads `name` where the model has `firstName`. | `backend/src/index.ts` |
| B3 | P0 | S | CORS allows `GET, POST, PUT, DELETE` but not `PATCH`. Even after B1 is fixed in the other direction, browser preflights for PATCH would fail. | `backend/src/index.ts` |
| B4 | P0 | S | `POST /leads` reads `name` from the body but the error message says `firstName`. It also skips the `parseLead` validation that bulk import uses (country code, LinkedIn URL, years). | `backend/src/index.ts` |
| B5 | P1 | S | `GET /leads/:id` returns `200 null` for a missing lead. `PATCH` and `DELETE` on a missing id throw a Prisma error. Express 5 forwards that to the default 500 handler. | `backend/src/index.ts` |
| B6 | P1 | S | Bulk import dedupes only by `firstName + lastName`. Two different people with the same name are dropped, and the same email under a different name is imported twice. Email is the natural key. Rows repeated inside the same CSV are also not deduped against each other. | `POST /leads/bulk` |
| B7 | P1 | S | `phoneEnrichmentStatus` is a free `String?`, and `phone` can be overwritten by a later enrichment run. There is no `phoneEnrichedAt`. | `schema.prisma` |

### 2.2 Architecture and backend

| # | Pri | Effort | Finding |
|---|-----|--------|---------|
| A1 | P0 | M | **Email verification blocks the request.** `POST /leads/verify-emails` calls `client.workflow.execute` for each lead one after another and waits. It opens a new Temporal connection per request, and the `jane.smith` case sleeps 20s. N leads can take N × 20s and hit browser or proxy timeouts. It also breaks the repo convention (the skill says routes answer 202, state lives in the DB, the UI polls). The workflowId uses `Date.now()`, so it is not idempotent. **Fix:** use the same pattern as `enrich-phone`: `workflow.start`, workflowId `verify-email-${leadId}`, the workflow writes `emailVerified` and a status, the route returns 202. |
| A2 | P1 | M | **One 388-line `index.ts` holds every route, the Temporal client and the server bootstrap.** Split it into `routes/leads.ts`, `services/`, `temporal/client.ts` and `app.ts` (testable without `listen`). The Temporal client is also created in two different ways (`getTemporalClient` and an inline `Connection.connect`). |
| A3 | P1 | M | **No request validation layer.** Each route hand-checks `req.body`. Use a schema library (zod) shared by `POST`, `PATCH` and bulk import, and reuse `parseLead` from it. Return a consistent error shape (`{ error, details }`). |
| A4 | P1 | S | **No central error handling.** Routes repeat `try/catch` plus `console.error`. Add an error middleware, map Prisma `P2025` to 404 and validation errors to 400, and use structured logging (pino). |
| A5 | P1 | M | **Writes in loops.** Message generation and bulk import issue one query per lead. Use `createMany` (note: SQLite has no `skipDuplicates`) or `$transaction`, and chunk the dedupe `OR` query. With a few thousand rows the `OR` list will hit SQLite's variable limit. |
| A6 | P1 | S | **`GET /leads` is unbounded.** There is no pagination, filter or sort. Add cursor pagination plus server-side search and status filters before the table grows. |
| A7 | P1 | M | **Hardcoded config.** The Temporal address, namespace and task queue are repeated in `index.ts` and `worker.ts`, and the port is fixed at 4000. Provider URLs and keys fall back to defaults in code (`env.ts`). Move everything into one validated config module with no secret defaults. Rotate the keys that are in the README. |
| A8 | P1 | M | **Worker and API share one process.** `runTemporalWorker()` starts inside the API process, and a worker crash calls `process.exit(1)` for the API as well. Run them as two entrypoints (`pnpm dev:api`, `pnpm dev:worker`) so they scale and deploy independently. There is also no graceful shutdown (`SIGTERM`: stop `listen`, `worker.shutdown()`, `prisma.$disconnect()`). |
| A9 | P0 | M | **Provider rate limits.** Moved to the priority theme in section 2.0 (R1–R9). |
| A10 | P2 | S | **Enrichment details.** `phoneEnrichmentStatus` stays `pending` forever if the workflow is terminated or the worker is down. Add a `phoneEnrichmentUpdatedAt` and a reaper, or reconcile with the Temporal workflow state. Re-running enrichment after `not_found` needs a clear rule (cooldown or a "force" flag). |
| A11 | P2 | S | **Message generation errors are swallowed per lead** and the route always returns `success: true`, even when every lead failed. Return a 207 or an explicit `failedCount`. |

### 2.3 Security and data

| # | Pri | Effort | Finding |
|---|-----|--------|---------|
| S1 | P0 | M | **No authentication or authorisation.** Anyone who reaches port 4000 can read, delete or import all leads (personal data). Add auth (session or JWT), a `userId` / `workspaceId` on `lead`, and scope every query by it. |
| S2 | P0 | S | **CORS is `*`** and written by hand. Use the `cors` package with an allow-list from config. |
| S3 | P1 | S | **No body size limit, rate limiting or security headers.** Add `express.json({ limit })`, `helmet` and `express-rate-limit`. `DELETE /leads` with an `ids` array and bulk import accept unbounded arrays. |
| S4 | P1 | S | **Provider keys are in the README and have code fallbacks.** Keep them in `.env` or a secret manager only. Never log the full provider URL (Nimbus passes its key as a query parameter). |
| S5 | P2 | M | **SQLite committed to the repo** (`prisma/dev.db` is tracked, and it contains lead data). Remove it from git. Plan a move to Postgres (concurrent writers from API and worker, indexes, migrations in CI). Also add indexes on `email` and on `phoneEnrichmentStatus`. |
| S6 | P2 | S | **GDPR / privacy.** Leads are personal data. Add a delete-by-email path, retention rules and an audit trail of who enriched what and from which provider. |

### 2.4 Frontend

| # | Pri | Effort | Finding |
|---|-----|--------|---------|
| F1 | P1 | M | **Large components.** `LeadsList` (432 lines), `MessageTemplateModal` (414) and `CsvImportModal` (369) mix data fetching, state and markup. Extract hooks (`useLeads`, `useLeadSelection`, `useEnrichmentPolling`) and presentational pieces (table row, status badge, toolbar). |
| F2 | P1 | S | **API types are duplicated by hand.** `frontend/src/api/types` and the backend model can drift, and B1 is a direct example. Share types (a small `packages/contracts` or OpenAPI / zod → generated client) and add a contract test per endpoint. |
| F3 | P1 | M | **Whole-list polling.** `refetchInterval` refetches all leads while any enrichment is pending. After pagination (A6), poll only the visible page, or replace polling with SSE / WebSocket updates driven by workflow completion. |
| F4 | P1 | S | **Email verification gives no progress feedback**, because the request blocks (A1). After A1, show per-row status like phone enrichment. |
| F5 | P1 | M | **Table scale.** No pagination, sorting, column visibility or virtualisation. With the new fields the table is already wide. Add column chooser, sticky columns and virtual rows (TanStack Table + Virtual). |
| F6 | P2 | S | **Accessibility.** Audit modals (focus trap, `aria-modal`, Escape), the enrich dropdown (keyboard + roles), status badges (not colour only) and the selection checkboxes. |
| F7 | P2 | S | **Tests cover utils only.** There are no component tests for `LeadsList` or the modals, even though Testing Library is installed. Add tests for selection, bulk actions and polling. |
| F8 | P2 | S | **Duplicated logic.** `countryCode`, `isoCountryCodes` and `leadFields` exist in both `frontend/src/utils` and `backend/src/utils`. Move them into the shared package from F2. |

### 2.5 Quality, tooling and operations

| # | Pri | Effort | Finding |
|---|-----|--------|---------|
| Q1 | P1 | S | **No CI.** Add a workflow running `pnpm lint`, `test` and `build` in both packages on every PR, plus `prisma migrate diff` to catch schema drift. |
| Q2 | P1 | M | **No route-level tests.** Unit tests exist for utils, providers and workflows (good), but nothing exercises the Express routes. Extract `app.ts` (A2) and use `supertest` with a test SQLite DB. Use `@temporalio/testing` for workflow integration. |
| Q3 | P2 | S | **Two independent packages with no root workspace.** A root `pnpm-workspace.yaml` plus a single `pnpm test`, `lint` and `format` command removes duplication and enables shared packages. Pin Node via `.nvmrc` at the root. |
| Q4 | P2 | M | **Observability.** Add structured logs with a request id and lead id, metrics (workflow success rate, provider latency and hit rate, retries), and alerts on stuck `pending` leads. Temporal search attributes (`leadId`, `provider`) make workflows easy to find. |
| Q5 | P2 | S | **Prisma schema formatting.** The new fields are not aligned or ordered (`prisma format`), and `lastName` is required in the schema but typed as nullable in some route code. Make the types consistent. |
| Q6 | P2 | S | **Docs.** README covers setup but not the architecture. Add a short `docs/architecture.md` (request → workflow → DB → polling diagram) and an API reference. |

## 3. Roadmap

Sizing assumes 1–2 engineers. Items reference the IDs above.

### Phase 0 — Stop the bleeding (week 1)

Goal: no known bugs, no data exposure, and safe behaviour when providers apply limits.

- **R1, R2, R3 (provider rate limits):** honour `Retry-After`, add distinct statuses, cap throughput per provider with dedicated task queues. These go first because the limits can arrive at any time and the current behaviour degrades results silently.
- R4, R9: per-provider config and tests for the 429 paths.
- B1, B2, B3, B4, B5: fix the lead CRUD contract (`PATCH`, partial updates, 404s, CORS).
- A1 + F4: make email verification asynchronous with status in the DB and a UI badge.
- S2, S3: CORS allow-list, body limits, rate limit, helmet.
- S4, S5 (git part): rotate and remove secrets, untrack `dev.db`.
- Q1: CI with lint, test and build.

### Phase 1 — Foundations (weeks 2–4)

Goal: a codebase that is easy to change safely.

- A2, A3, A4: split `index.ts`, add the validation layer and the error middleware.
- Q2: route tests with supertest, workflow tests with the Temporal test environment.
- A7, A8: central config, separate API and worker processes, graceful shutdown.
- B6, B7: dedupe by email, enum for statuses, `phoneEnrichedAt`.
- S1: authentication and workspace scoping (see open questions).
- F1, F2, F8: component split and shared contracts.

### Phase 2 — Scale (weeks 5–8)

Goal: handle tens of thousands of leads and real provider limits.

- A5, A6, F3, F5: batched writes, pagination, server-side filters, virtualised table, scoped polling.
- R5, R6, R7, R8: throttled batch start, adaptive limiting, circuit breaker and provider metrics (the base is done in Phase 0).
- A10: stuck-`pending` reconciliation and re-enrichment policy.
- S5 (Postgres): migrate off SQLite, add indexes.
- Q4: metrics, dashboards and alerts.

### Phase 3 — Product growth (after week 8)

- A provider registry: add or remove providers and reorder the cascade from config (or per workspace) with cost-aware ordering. The abstraction in `providers/phone` already supports this.
- A generic enrichment framework (email, company, LinkedIn) reusing the same workflow shape.
- A custom field model, since "the field list will keep growing": a key / value table or JSON column with a typed schema. The frontend template picker already scales, so this is the backend part.
- Message generation with an LLM (tone, language), with templates stored and versioned.
- GDPR tooling (S6), export, audit log.

## 4. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Adding auth (S1) touches every query and the schema | Medium | Do it before pagination and Postgres so the scoping is built in once |
| SQLite → Postgres migration | Medium | Prisma abstracts most of it. Do it in Phase 2 with a dump and a dry run |
| Provider rate limits arrive before R1–R3 are done | High | Stopgap in under a day: lower `maxConcurrentActivityTaskExecutions` on the worker and stop enrichment batches above a small size |
| Real limits differ from what we assume (per minute, per key, shared across clients) | Medium | Keep limits in config (R4), measure 429s (R8), and ask the providers for the exact numbers (open question 3) |
| Workflow changes break running executions | Medium | Use Temporal `patched()` or versioning for any change in `enrichPhoneWorkflow` |

## 5. Open questions

1. Is this a single-tenant tool or will it be multi-workspace? (decides the shape of S1)
2. What volume of leads and enrichments per day do we expect in 6 months? (decides when Phase 2 is needed)
3. Do the providers have a published rate-limit date or numbers?
4. Should a lead with `not_found` be retried automatically after some time?
5. Who owns the provider keys and their rotation?
