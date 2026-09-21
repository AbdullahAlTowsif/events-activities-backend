# Code Review Report — events-backend

**Date:** 2026-09-20
**Scope:** Entire repository (`src/`, `prisma/schema/`, config).
**Stack:** Express 5 + TypeScript (strict) + Prisma 7 (Postgres via `@prisma/adapter-pg`) + zod v4 + Stripe + Cloudinary + OpenRouter.

---

## Summary

The codebase is a working monolith with a clear module layout (interface / validation / service / controller / routes), but it is largely a learning project with heavy `console.log` debugging, large commented-out blocks, and several **critical security bugs** around payments and password-hash leakage, plus a pervasive error-handling bug that turns every `ApiError` into an HTTP 500.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low / quality.

---

## 🔴 Critical

### C1. Public, unauthenticated endpoint can mark any payment as paid — payment bypass

- `src/app/modules/payment/payment.routes.ts:21-25` — `POST /api/payment/manual-webhook` has **no `auth` middleware**.
- `src/app/modules/payment/payment.controller.ts:234-287` — `manualWebhook` retrieves any Stripe session by `session_id` and, if `payment_status === "paid"`, fabricates a `checkout.session.completed` event and calls `handleStripeWebhookEvent`, which flips the DB payment/participant to `SUCCESS`/`ACCEPTED`/`paid`.

Any anonymous caller can call `POST /api/payment/manual-webhook?session_id=<any session>` and mark an arbitrary payment and participant as paid without a valid Stripe signature. In a real deployment this means **events can be attended without paying**.

**Fix:** remove the endpoint (the real webhook path is the only authorized path), or require the exact same signature verification as `stripeWebhook` plus proof the session belongs to the requesting user.

### C2. Payment amount and currency are client-controlled, not taken from the event

- `src/app/modules/payment/payment.controller.ts:30` — `const amount = Number(req.body.amount ?? req.body.joiningFee ?? 0)` and `:40` currency from body.
- `src/app/modules/payment/payment.service.ts:87` stores `amount: Math.round(amount)`, `:129` sends `Math.round(amount * 100)` to Stripe.

The server fetches the `event` but never compares `req.body.amount` to `event.joiningFee`. A user can pay `1` (or `0.01` currency units) to join an event whose fee is e.g. 1000. The controller only rejects `amount <= 0`.

**Fix:** always use `event.joiningFee` and `event.currency` from the DB and ignore client-sent values (or validate equality). Also enforce `amount >= 0`.

### C3. Password hashes are returned in several public/authenticated responses

- `src/app/modules/event/event.service.ts:98-117` (`getAllEvent`) — `select` includes `host: true`, `payments: true`, `participants: true`. `Host` has a `password` column, so `GET /api/event/events` returns host password hashes.
- `src/app/modules/event/event.service.ts:135-155` (`getEventById`, publicly reachable via `GET /api/event/:id`) — `include: { host: true }`, `participants: { include: { user: true } }`, `payments: { include: { user: true } }`. This exposes the **password hashes of the host and every participant/payer**.
- `src/app/modules/event/event.service.ts:486-509` (`getHostByEmail`) — `host` row is returned whole, including `password`.

**Fix:** always project `select` on `host`/`user` without `password` (and ideally without other internal columns). Never use `include: { host: true }` / `user: true` on public endpoints.

### C4. Unvalidated mass-assignment on paid-capable update routes

- `src/app/modules/event/event.routes.ts:35-39` — `PATCH /update/:id` has **no validation middleware**; raw `req.body` flows straight into `prisma.event.update`.
- `src/app/modules/event/event.service.ts:158-181` (`updateEventById`) — accepts `data: Partial<Event>` from the request body. A host/admin can change `status`, `hostEmail` (transfer event ownership), `dateTime`, `joiningFee` to a negative number, `images`, etc.
- `src/app/modules/user/user.service.ts:315-398` (`updateMyProfile`) — no zod validation. A user can set `role: "ADMIN"`, change `email` (breaking foreign keys — see H5), set arbitrary fields.
- `src/app/modules/admin/admin.service.ts:186-272` (`updatePersonIntoDB`) — `req.body` passed raw to `user.update`. An admin can write a **plaintext `password`** (never hashed) into the child table and desync it from `Person.password` (which is the one used for login). The route does not use the existing `admin.validation.ts` schema.
- `src/app/modules/review/review.validation.ts`… none — `POST /:id/review` (`event.routes.ts:62-66`) accepts arbitrary `rating`/`comment` (e.g. `rating: 999`) with no validation or bounds check.

**Fix:** apply strict, per-route zod schemas via the existing `validateRequest` middleware (or the inline-parse pattern already used in `user.routes`/`event.routes`), whitelist writable fields with `pick`, forbid role/email/password changes on self-service routes, and re-hash any password write on the server.

### C5. Global error handler always responds HTTP 500 — every `ApiError` status is lost

- `src/app/middlewares/globalErrorHandler.ts:17-44` — `let statusCode = httpStatus.INTERNAL_SERVER_ERROR` and it is **never reassigned from `err.statusCode`**. `ApiError` (`src/app/errors/ApiError.ts:1-13`) carries `statusCode`, but:
  - `auth` middleware throws `ApiError(401, ...)` → clients get **500** for invalid/expired tokens (`src/app/middlewares/auth.ts:21-30`).
  - All `ApiError(400/403/404/...)` in `event.service.ts`, `host.service.ts`, etc. are returned as 500.
  - Prisma `P2002` “Duplicate key” returns 500 (should be 409), and validation errors surface as 500 (should be 400/422).
  - `loginPerson`'s `new Error("Password incorrect!")` also becomes 500 instead of 401.

**Fix:** at minimum `statusCode = err.statusCode ?? httpStatus.INTERNAL_SERVER_ERROR;`. Then handle `ZodError` (→ 400/422 with issues), Prisma `P2002` (→ 409), and keep the existing sanitization.

### C6. IDOR on payment verification — read others' payment/participant data

- `src/app/modules/payment/payment.controller.ts:94-232` (`verifyPayment`, route `payment.routes.ts:14-18`) — any authenticated user can pass **any** `session_id` and read the payment status / participant status of other users. There is no `payment.userEmail === req.user.email` check.

**Fix:** require the queried payment to belong to `req.user.email`.

---

## 🟠 High

### H1. `getMyProfile` only queries the `User` table — broken for Hosts and Admins

- `src/app/modules/user/user.service.ts:238-312` — starts with `prisma.user.findUniqueOrThrow({ where: { email: user?.email } })`. Accounts created through `create-host`/`create-admin` (and the seeded admin) have **no `User` row**, so `GET /api/user/me` throws Prisma `P2025` → 500 for hosts and admins. Only regular users show a profile.

**Fix:** query `Person` first (as `auth.getMe` does) and branch by `role`.

### H2. Host can join their own event — broken identity check

- `src/app/modules/event/event.service.ts:243-253` — `if (host && host.id === userEmail)` compares **`Host.id` (a UUID) to `userEmail` (a string)**; it can never be true. The correct check is `event.hostEmail === userEmail`. Hosts (who authenticate with an email) can therefore join and even compete for their own event's capacity.

**Fix:** `if (event.hostEmail === userEmail) throw new ApiError(400, "You cannot join your own event");` (drop the dead `hostEmail === undefined` check too).

### H3. Join/create-payment flow leaves orphaned payments and wrong participant state

- `src/app/modules/event/event.service.ts:276-301` (`joinEvent`): a participant is created with `status: ACCEPTED` and `paid: joiningFee === 0` **before any payment**, and the `Payment` row it creates for fee-based events is **not linked** to the participant (`paymentId` is never set). The comment `joinEvent` finds, then `initPayment` runs.
- `src/app/modules/payment/payment.service.ts:81-172` (`createPaymentAndSession`): each `initPayment` call **creates a brand-new `Payment` row** and re-links the participant to it, so every join+init leaves an orphaned PENDING payment. Users can also call `init` repeatedly, multiplying Stripe sessions and payment rows.
- Consequences: a user who joins a paid event but never pays is already `ACCEPTED`; paid state and payment rows disagree; the dashboard/revenue counts are inflated; `getMyPaidEvents` relies on `participant.paid === true`, which only flips after webhook.

**Fix:** unify the flow — `joinEvent` should create the participant as `PENDING` for paid events (no `Payment` row), and `initPayment` should create/update the payment and participant atomically (upsert on `(eventId, userEmail, status PENDING)`) with an idempotency key. Set `participant.paymentId` at creation time.

### H4. `leaveEvent` claims a refund that never happens

- `src/app/modules/event/event.service.ts:305-353` — deletes the participant, returns `refunded: participant.paid ? true : false`. No Stripe refund is initiated, the `Payment` row (status `SUCCESS`) is orphaned and stays SUCCESS, and paid seats are freed without any money movement.

**Fix:** either implement an actual Stripe refund + `PaymentStatus.REFUNDED` update in the same transaction, or return `refunded: false` with `needsRefund: true` and an explicit refund flow.

### H5. Email/role changes on child tables corrupt the denormalized identity model

Because identity data is duplicated across `Person` + `User`/`Host`/`Admin` keyed by `email` (see S1), any field update on only one table breaks consistency:

- `updateMyProfile` (`user.service.ts:315-398`) writes to the child table only. Changing `email` leaves `Person.email` stale (login breaks, `getMyProfile`/`auth /me` diverge) while `Participant`/`Payment`/`Review` foreign keys still reference the old email.
- `admin.updatePersonIntoDB` (`admin.service.ts:186-272`) tries to sync `email`/`password` to `Person`, but updating `user.email` first violates the FK referencing `Person.email` (P2003), and changing an email used as an FK breaks connected records.

**Fix:** forbid email changes through these routes; if email updates are needed, run a proper migration inside a single transaction that updates all dependent tables. Treat `password` as a server-only field that is always re-hashed.

### H6. Hard-delete user/host/admin fails in practice and is inconsistent

- `src/app/modules/admin/admin.service.ts:275-342` (`deletePersonFromDB`) — deletes the child row then `person`. Any user with `Participant`/`Payment`/`Review`/`HostApplication` rows (declared relations with no `onDelete: Cascade`) throws Prisma `P2003`. There is also no `isDeleted` guard. Combined with no cascade in the schema, this endpoint is mostly broken.

**Fix:** use the existing soft-delete path consistently, or add explicit cascade/`onDelete` behavior and cleanup of child records in a transaction (cf. `deleteEvent` which does that manually).

### H7. Rejected host applications are deleted — feedback is lost

- `src/app/modules/host/host.service.ts:272-283` — on `REJECTED` the application row (including `feedback`, `reviewedBy`, `reviewedAt`) is hard-deleted. The applicant's `getMyApplications` never shows a rejection or the admin's feedback.
- Also `:219-238` — on `APPROVED` the new `Host` is seeded with `application.user.password`, which can be **stale**: `changePassword` only updates `Person.password`, never the child table, so the copied hash may not match the user's actual password.

**Fix:** keep rejected applications (set `status`), only delete on `CANCELLED`, and use `Person.password` (or re-hash) when creating the `Host`.

### H8. Events can be joined after they started; capacity not enforced robustly

- `src/app/modules/event/event.service.ts:225-301` (`joinEvent`) — never checks `event.dateTime` against `now()`, so past events remain joinable.
- `:268-273` — max-capacity check counts `event.participants.length`, which **includes PENDING (unpaid) participants**, and is vulnerable to a race (two concurrent joins both pass the check in default read-committed isolation). The event `status` is also never flipped to `FULL`.

**Fix:** block joining events with `dateTime <= now()`; count only `ACCEPTED` participants; serialize capacity checks (e.g., conditional update / advisory lock, or set `status: FULL` transactionally); optionally auto-set `FULL`.

### H9. Password hashes exposed to admins (admin listing endpoints)

- `src/app/modules/admin/admin.service.ts:46-55` (`getAllAdmin`) and `:558-575` (`getAllHosts`) — `findMany` returns complete rows including `password`.

**Fix:** add a `select` excluding `password`.

---

## 🟡 Medium

- **M1. Stripe HTTP call inside a DB transaction** — `payment.service.ts:81-172` runs `stripe.checkout.sessions.create` (an external, slow call that can fail) inside `prisma.$transaction`, holding a pooled connection open and making the transaction non-atomic from Stripe's perspective. Move the Stripe call out, or at least out of the critical section.
- **M2. `getParticipants` exposes contact details of everyone** — `event.service.ts:356-398` explicitly allows any `USER` to see other participants' `contactNumber`, `address`, `gender`. That is PII; restrict to host/admin (and maybe require paid/ACCEPTED membership or explicit opt-in).
- **M3. `createEvent` duplicate check is broken** — `event.service.ts:13-19` matches on `req.body.hostEmail`, but the route already ran the zod schema (`event.routes.ts:14-18`), which strips `hostEmail` (not in the schema) — so the check compares against `undefined` and effectively only tests `title∧type∧location`. Either it should use the authenticated `hostEmail` or be removed.
- **M4. `createReview` allows reviewing cancelled/past-dated events and unverified attendance** — `event.service.ts:401-483`: only checks `dateTime` in the past, not `status === COMPLETED`; only checks a `Participant` row exists, not that it is `ACCEPTED` AND `paid` for paid events.
- **M5. Cookie flags break local/HTTP development** — `auth.controller.ts:63-74` / `:149-161`: `secure: true, sameSite: "none"` means browsers drop the cookies over plain HTTP. Works over localhost in Chrome but breaks other tools; consider gating `secure` on `NODE_ENV`.
- **M6. No rate limiting / brute-force protection** — `/api/auth/login` and `/refresh-token` have no throttling; JWT access secrets in `.env` are placeholder strings (`your_jwt_secret_key_here`). Rotate real secrets and add throttling (e.g., `express-rate-limit`) on auth endpoints.
- **M7. `deleteEvent` bypasses refund/cleanup accounting** — `event.service.ts:184-222` deletes participants and payments without handling Stripe refunds for paid participants; also doesn't block or warn admin.
- **M8. Inconsistent/multiplicity of orphaned states on webhook `session.expired`** — `payment.service.ts:286-313` flips participant to `REJECTED`, but a user's *earlier* successful payment for the same event would be incorrectly downgraded; also PENDING rows created by `joinEvent` are never cleaned.
- **M9. `getMe` (auth) trusts whatever is in the cookie jar** — `auth.controller.ts:213-224` reads `req.cookies` and `auth.service.ts:183-316` verifies only `user.accessToken`; any leftover `accessToken` cookie still returns a profile — acceptable for a session cookie design, but note the cookie is the sole source of truth and `auth` middleware is bypassable here; better to require the `auth` middleware.
- **M10. JSON bodies to file-upload routes crash with 500** — `user.routes.ts:26-29,37-38,46-49,57-59` and `event.routes.ts:15-17` call `JSON.parse(req.body.data)`; if a client sends a plain JSON body (no `data` string field), the throw escapes to the error handler as an ugly 500. Return a 400 with a clear message.
- **M11. Unauthenticated confirmation of user enumeration** — `loginPerson` throws distinguishable errors (`User not found` via `findUniqueOrThrow` vs `Password incorrect!`); combined with M6 this aids credential stuffing.

---

## 🔵 Low / Quality

- **Q1. Massive commented-out/dead code** — `auth.service.ts:118-180` (forgot/reset password), `admin.service.ts:108-184,591-722` (large alternate implementations), `payment.service.ts:14-70,176-227` (older implementations), `recommendation.service.ts:1-174` (duplicate old version). Delete or move to git history.
- **Q2. Duplicated duration-parsing logic** — the whole "string → ms" conversion is copy-pasted twice in `auth.controller.ts:13-60` and `:94-145`. Extract a helper.
- **Q3. Empty/duplicate support files** — `user.interface.ts` is empty; `pagination.ts` (`IPaginationOptions`) and `paginationHelper.ts` (`IOptions`) define overlapping types; `event.interface.ts` is unused (service returns Prisma `Event`); `admin.validation.ts` exists but is never wired to any route; unused import `email` from `zod` in `admin.controller.ts:9`.
- **Q4. Dead dependency** — `mongoose` in `package.json` is unused (leftover from a template).
- **Q5. pagination edge cases** — `paginationHelper.ts:17-19`: `page: 0` → negative `skip` → Prisma error; `limit` unbounded (no max) enabling huge fetches.
- **Q6. N+1 / heavyweight queries** — `getAllEvent` (`event.service.ts:98-117`) loads **all** payments and participants per event even when they aren't needed; prefer `_count` aggregation and lazy loading.
- **Q7. `sanitizeError` only hides Prisma `P...` errors** — generic internal errors (statement errors, `JSON.parse`, etc.) are still returned to clients; log server-side and return generic messages in production.
- **Q8. Schema smells** — `SubmitStatus`-style defaults (`Admin/Host/User role` default to `USER`) and copy-pasted columns across the three role tables invite the desync bugs above (H1, H5, H7). `Review` is not tied to an event (only host), and `Participant.status` defaults to `ACCEPTED` while payment is still unpaid (schema `event.prisma:30`).
- **Q9. No tests, no lint tooling** — `npm test` is a stub; eslint is a devDependency with no config. High-value tests: payment webhook idempotency, join/leave capacity, auth status codes.
- **Q10. Secret hygiene** — `.env` is gitignored (good) but contains real-looking secrets (Neon, Stripe test key, Cloudinary, OpenRouter) plus placeholder JWT secrets. Rotate anything that has shipped anywhere, and consider `.env.example`.

---

## Suggested improvements (structural)

1. **Fix the error pipeline first** (C5) — it changes the observable behavior of almost every endpoint.
2. **Kill the payment bypasses** (C1, C2) — server-side authoritative amounts + only the signature-verified webhook flips payment state.
3. **Never leak password hashes** (C3, H9) — audit every `include: true`/`findMany` that touches `User`/`Host`/`Admin`.
4. **Apply schema-first validation everywhere** — wire `validateRequest` into every `POST`/`PATCH`/`PUT` and whitelist fields; stop trusting `req.body`.
5. **Re-architect identity** — replace the `Person` + role-table split with a single `User` row and a role discriminator, with explicit `onDelete` policies and proper indexes; this removes H1/H5/H6/H7 at the root. Add a `Participant(eventId, userEmail)` unique index to hard-block duplicate joins.
6. **Single join→payment flow** — one participant, one pending payment (upsert), Stripe session outside the DB transaction with an idempotency key, webhook updates done idempotently (guard on current status).
7. **Add minimal automated tests** for auth, payments, and capacity logic, plus a `npm run check` (typecheck = `npx tsc --noEmit`).

---

## Files reviewed

All of `prisma/schema/*.prisma`, `src/app.ts`, `src/server.ts`, `src/app/{config,helper,middlewares,utils,interfaces,errors,routes}/*`, and every file under `src/app/modules/{user,auth,event,payment,host,admin,review,recommendation}/`, plus `package.json`, `tsconfig.json`, `prisma.config.ts`, `.env` (keys only), `.gitignore`, `render-build.sh`.