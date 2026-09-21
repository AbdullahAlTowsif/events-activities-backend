# Fixed Issues Plan — events-backend

Reference: `docs/code_review.md` (full issue analysis).

## Decisions (confirmed)

- **Identity model (H1/H5/H6/H7):** Option A — incremental fixes on the current `Person` / `User` / `Host` / `Admin` schema. No destructive migration.
- **C1 manual-webhook:** remove the endpoint entirely; the signed Stripe `/api/payment/stripe/webhook` is the only authorized path.
- **Tooling:** allow new npm packages — `express-rate-limit` (M6), `vitest` (Q9), and `helmet`.

---

## Phase 0 — Baseline & safety

- Create branch `fix/review-issues`; run `npx tsc --noEmit` to capture the current baseline.
- Take a snapshot/backup of the live Neon Postgres DB before any schema migration (Phase 6 unique index).

## Phase 1 — Error pipeline (`C5`, `M11`, `Q7`)

- `src/app/middlewares/globalErrorHandler.ts`
  - `statusCode = err.statusCode ?? httpStatus.INTERNAL_SERVER_ERROR;`
  - Map: `ApiError` → its status; `ZodError` → 400/422 with `issues`; Prisma `P2002` → 409; `P2025` → 404; `P2003` → 400.
  - Keep `sanitizeError`; also make generic unknown errors safe in production (don't leak internals).
- `src/app/modules/auth/auth.service.ts`
  - Use `ApiError(401, ...)` with a single generic message for both "no account" and "wrong password" to stop user enumeration (`M11`).

## Phase 2 — Payments (`C1`, `C2`, `C6`, `H3`, `H4`, `M1`, `M7`, `M8`)

- **C1:** delete `manualWebhook` from `payment.controller.ts` and its route `POST /api/payment/manual-webhook` from `payment.routes.ts`.
- **C2:** `initPayment` ignores client `amount`/`currency`; always charge `event.joiningFee` / `event.currency` from DB; reject non-positive fees.
- **C6:** `verifyPayment` requires `payment.userEmail === req.user.email` (admin exempt via `auth` role check).
- **M1 / H3:** `createPaymentAndSession` — move `stripe.checkout.sessions.create` **outside** the DB transaction; upsert a single PENDING payment per `(eventId, userEmail)`; set `participant.paymentId` at creation; no duplicate Payment rows; add idempotency guard.
- **H3:** `joinEvent` — paid events create participant `status: PENDING`, `paid: false`, **no** inline Payment row; free events create `ACCEPTED`, `paid: true`.
- **H4:** `leaveEvent` — real Stripe refund (`stripe.refunds.create`) for paid/SUCCESS enrollments, mark Payment `REFUNDED`, return `refunded: true` only on success; otherwise return explicit `needsRefund` and 500-safe behavior.
- **M7:** `deleteEvent` — refuse deletion or refund paid participants (Stripe) before removing payments/participants.
- **M8:** webhooks idempotent — only transition `PENDING → SUCCESS`; `checkout.session.expired` must not downgrade an already-paid enrollment.

## Phase 3 — Password & data hygiene (`C3`, `H9`, `Q6`)

- `src/app/modules/event/event.service.ts`
  - `getAllEvent` (`:98-117`): prune `host` to public fields; replace `payments: true` / `participants: true` with `_count`.
  - `getEventById` (`:135-155`): `host`/`user` selected without `password`.
  - `getHostByEmail` (`:486-509`): select host fields without `password`.
- `src/app/modules/admin/admin.service.ts`
  - `getAllAdmin` (`:46-55`) and `getAllHosts` (`:558-575`): add `select` excluding `password`.
- Extract shared `publicUserSelect` / `publicHostSelect` helpers to prevent regression.

## Phase 4 — Validation & mass-assignment (`C4`, `M3`, `M4`, `M10`, `Q3`)

- `src/app/middlewares/validateRequest.ts`: support `{ body, query, params }` shapes and parse accordingly; wire into every `POST/PATCH/PUT`.
- Add zod schemas:
  - `event.validation.ts`: `updateEventValidationSchema` — whitelist only `title,type,description,location,dateTime,minParticipants,maxParticipants,joiningFee,currency,images`; reject negative fee; reject past `dateTime`.
  - `review` (event module): `createReviewValidationSchema` — `rating` integer 1–5, `comment` optional ≤ 500 chars.
  - `user.validation.ts`: `updateMyProfileValidationSchema` — whitelist profile fields; forbid `role`, `email`, `password`, `isDeleted`.
  - Wire existing `admin.validation.ts` into `updatePersonIntoDB`.
- `createEvent` (`event.service.ts:13-19`): duplicate check uses authenticated `hostEmail`, not the (stripped) `req.body.hostEmail` (`M3`).
- `JSON.parse(req.body.data)` guarded in routes (`user.routes.ts`, `event.routes.ts`) → 400 instead of 500 (`M10`).
- `updatePersonIntoDB` (`admin.service.ts:186-272`): stop passing raw password — strip or re-hash and sync with `Person`; whitelist writable fields.

## Phase 5 — Identity model, Option A (`H1`, `H5`, `H6`, `H7`)

- **H1:** `getMyProfile` (`user.service.ts:238-312`) — query `Person` first, branch by `role` (mirror `auth.getMe`).
- **H5:** forbid email / role / password changes on `updateMyProfile` and admin update routes; keep email immutable; password handled server-side only.
- **H6:** `deletePersonFromDB` (`admin.service.ts:275-342`) — repoint hard-delete route to soft-delete, or guard with dependent-record cleanup in a transaction.
- **H7:** `host.service.ts` —
  - REJECTED: keep the application with `status: REJECTED` + `feedback` (only delete on `CANCELLED`).
  - APPROVED: seed `Host` with `Person.password` (or re-hash), not stale `user.password`.
  - `applyToBeHost`: block soft-deleted users from re-applying.

## Phase 6 — Event domain (`H2`, `H8`, `M2`)

- **H2:** `joinEvent` (`event.service.ts:243-253`) — replace broken UUID↔email check with `if (event.hostEmail === userEmail) throw ApiError(400, ...)`; drop dead `hostEmail === undefined` check.
- **H8:** block joining events with `dateTime <= now()`; capacity counts only `ACCEPTED` participants; set `status = FULL` transactionally at capacity.
- Schema: add `@@unique([eventId, userEmail])` on `Participant` (`prisma/schema/event.prisma`) as a hard duplicate-join guard + new migration.
- **M2:** `getParticipants` (`event.service.ts:356-398`) — restrict to host/admin (or require the caller to be an ACCEPTED participant); trim `contactNumber`/`address`/`gender` for non-hosts.

## Phase 7 — Ops & tooling (`M5`, `M6`, `M9`, `Q1–Q5`, `Q9–Q10`)

- **M5:** cookies `secure: true` and `sameSite: "none"` only when `NODE_ENV === "production"` (dev uses `lax` over HTTP).
- **M6:** add `express-rate-limit` on `/api/auth/login` and `/api/auth/refresh-token`; rotate JWT secrets in `.env`.
- **M9:** require the `auth` middleware on `/api/auth/me` (verify cookie token server-side → 401 on missing).
- **Q1:** delete commented-out/dead blocks in `auth.service.ts`, `admin.service.ts`, `payment.service.ts`, `recommendation.service.ts`.
- **Q2:** extract `parseExpiryToMs(expiresIn)` helper; reuse in `auth.controller.ts` (both login and refresh).
- **Q3:** remove empty/duplicate files (`user.interface.ts`), align pagination types, drop unused import `email` from `zod` in `admin.controller.ts`.
- **Q4:** remove `mongoose` from `package.json`.
- **Q5:** clamp pagination `page >= 1`, `limit <= 100` in `paginationHelper.ts`.
- **Q9:** add `vitest` + tests for payment webhook idempotency, join capacity, auth status codes; set `npm test`; add `npm run check` (`tsc --noEmit`).
- **Q10:** add `.env.example` (stripped); rotate any secrets that ever shipped.

## Phase 8 — Regression verification

- After each phase: `npx tsc --noEmit`.
- Final: `npm run build` → boot dev server (`npm run dev`) → smoke-test auth, event CRUD, join → init → webhook, review, host application flows → run `npm test`.

---

## Progress (20 Sep 2026)

- **Phase 0 ✅** branch `fix/review-issues`; `tsc --noEmit` baseline clean.
- **Phase 1 ✅** error pipeline: `globalErrorHandler.ts` (statusCode / ZodError→400 / P2002→409 / P2025→404 / P2003→400 / prod-sanitize + `null` guard), uniform 401 in `auth.service.ts`.
- **Phase 2 ✅** `payment.service.ts` + `payment.controller.ts` rewritten (server-side amounts C2, no Stripe in txn M1, idempotent webhook M8, C1 manual-webhook removed incl. route); `leaveEvent` real refund (H4); `deleteEvent` refuses while paid enrollments exist (M7); `joinEvent` PENDING/ACCEPTED w/o inline payment (H3).
- **Phase 3 ✅** shared `publicUserSelect`/`publicHostSelect`/`paymentBriefSelect` (`src/app/utils/publicSelects.ts`); pruned password leaks in event/admin/user services.
- **Phase 4 ✅** `validateRequest.ts` supports flat + `{body,query,params}`; strict event/review/profile zod schemas; `parseMultipartBody` (M10); whitelist+password-strip in `updatePersonIntoDB`; `createEvent` duplicate check uses authed `hostEmail`.
- **Phase 5 ✅** `getMyProfile` via Person-first (H1); admin update forbids email/role/password (H5); DELETE /person/:id→soft delete (H6); host application REJECTED kept w/ feedback + Host seeded from `Person.password` + soft-deleted users blocked (H7).
- **Phase 6 ✅** `joinEvent` host-self/duplicate/past-event/capacity checks (H2,H8); `getParticipants` host/admin/participant-only + trimmed fields (M2); migration `20260920100000_participant_event_user_unique` (dedup + `@@unique([eventId,userEmail])`) applied after `pg_dump` backup.
- **Phase 7 ✅** cookies env-aware secure/sameSite (M5); `express-rate-limit` on login/refresh (M6); `auth` on `/api/auth/me` (M9); dead code removed in auth/admin/recommendation services (Q1); `parseExpiryToMs` shared (Q2); removed `user.interface.ts` + unused zod import (Q3); `mongoose` removed (Q4); pagination clamped (Q5); vitest suite added (Q9); `.env.example` added (Q10); helmet enabled.
  - **Deferred:** rotating the live JWT secrets in `.env` is left to the operator (do before deploy).
- **Phase 8 ✅** `tsc --noEmit` clean; `npm run build` OK; booted server → `/` 200, public events list 200, `/api/auth/me` returns 401 unauth; `npm test` → 31 passed.