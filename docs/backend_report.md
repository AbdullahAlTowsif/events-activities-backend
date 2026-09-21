# Events & Activities — Backend API Report

**Audience:** Frontend developers (to integrate against this API).
**Date:** 2026-09-21
**Versions:** Express 5 + TypeScript (strict) + Prisma 7 (Postgres on Neon) + zod v4 + Stripe + Cloudinary + OpenRouter.

This report documents what the backend does, how it is structured, every endpoint a frontend needs, and the conventions you must follow when calling it. It reflects the code **after** the fixes described in `docs/fixed_issues.md` (security/payment hardening) so every behaviour below matches the current implementation.

---

## 1. Top-level facts

- API is mounted under the prefix **`/api`**.
- Server entry: `src/server.ts` → `src/app.ts` → routes in `src/app/routes/index.ts`.
- All routes are grouped per "module", registered as: `/api/user`, `/api/auth`, `/api/event`, `/api/payment`, `/api/host`, `/api/admin`, `/api/review`, `/api/recommendation`.
- Boot (dev: `npm run dev`, start: `npm start`, build `npm run build`). On every boot the server runs `seedAdmin()` which creates the super admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars (idempotent).
- Health check: `GET /` returns `{ message, environment, uptime, timeStamp }`.

### The response envelope (every success response)

```json
{
  "success": true,
  "message": "Human readable message",
  "meta": { "page": 1, "limit": 10, "total": 42 },   // ONLY on paginated list endpoints
  "data": { ... }                                     // or null
}
```

- `sendResponse` (`src/app/utils/sendResponse.ts`) is the single, consistent shape. Use it everywhere on the frontend.
- Paginated endpoints return `meta` **and** `data` (data is an array).

### The error envelope

```json
{
  "success": false,
  "message": "User-visible error message",
  "error": { ... }   // details (issues array, prisma meta, or null in production)
}
```

Status codes you will actually see:

| Case | Code |
|---|---|
| Success | `200` / `201` |
| Validation failed (zod) | `400` |
| `ApiError` thrown by business logic | its status (`400`, `401`, `403`, `404`, `409`, ...) |
| Duplicate unique key (Prisma `P2002`) | `409` |
| Record not found (Prisma `P2025`) | `404` |
| FK violation (Prisma `P2003`) | `400` |
| Unknown/internal error | `500` ("Something went wrong!" in production) |
| Route not found | `404` `{ success:false, message:"API NOT FOUND!" }` |

This mapping lives in `src/app/middlewares/globalErrorHandler.ts`.

---

## 2. Authentication model (READ THIS FIRST)

The backend uses **JWT in httpOnly cookies**, with a role-based access token.

### Identity model (how accounts are stored)

- One table `Person` = the account row (email + hashed password + role). Login only reads `Person`.
- Depending on `role`, a *profile row* exists in one of `users` / `admins` / `hosts` (keyed by the same `email`). Profile fields live there.
- Roles: `USER` (default), `HOST`, `ADMIN`.

> Frontend implication: you do **not** need to understand this split, but know:
> - `GET /api/auth/me` returns a merged shape: person fields at the top level **plus** a nested `user` / `host` / `admin` object. The nested object is the profile (`name`, `profilePhoto`, `contactNumber`, `address`, `gender`, `interests`, `isDeleted`, timestamps). Always check `data.user` / `data.host` / `data.admin` to read the profile — the top-level object has the `role`.
> - Email, password and role are NOT editable by the user (enforced server-side).

### Login flow

1. `POST /api/auth/login` with `{ email, password }`.
2. Server verifies against `Person`, then sets **two httpOnly cookies**: `accessToken` (short, default `1h`) and `refreshToken` (long, default `7d`).
3. Body on success also returns `data: { accessToken, refreshToken }` (in case you want to store them, though cookies are the canonical mechanism).

### Cookie flags

- Dev (`NODE_ENV=development`): `secure: false`, `sameSite: "lax"` → works over plain `http://localhost`.
- Prod: `secure: true`, `sameSite: "none"` → HTTPS only, cross-site allowed.

### Sending authenticated requests (browser)

Because the token is a cookie, the frontend fetch/axios calls must send credentials:

```js
// fetch
fetch(`${API}/auth/me`, { credentials: "include" })
// axios
axios.get(`${API}/auth/me`, { withCredentials: true })
```

CORS on the backend allows only:
- `http://localhost:3000`
- `https://events-activities-frontend.vercel.app`

with `credentials: true`. Anything on another origin will be blocked.

### Alternative: Bearer token

The `auth` middleware also accepts `Authorization: Bearer <accessToken>` (it tries the cookie first, then the header). Use this if you ever call the API from a non-browser client.

### Roles

Each protected route declares an explicit role whitelist. `HOST`/`ADMIN`/`USER` roles are passed to the `auth(...)` middleware.

---

## 3. Full endpoint reference

Legend: 🔓 public · 🔐 any authenticated role · 👤 USER · 🏢 HOST · 🛡️ ADMIN.

### 3.1 Auth — `/api/auth`

| Method & Path | Access | Body / Query | Response `data` |
|---|---|---|---|
| `POST /api/auth/login` | 🔓 (rate-limited) | `{ email, password }` | `{ accessToken, refreshToken }` + sets cookies |
| `POST /api/auth/refresh-token` | 🔓 (rate-limited) | — (reads `refreshToken` cookie) | `{ message }` + refreshes both cookies |
| `POST /api/auth/change-password` | 🔐 | `{ oldPassword, newPassword }` | `{ message }` |
| `POST /api/auth/logout` | 🔓 | — | clears `accessToken` + `refreshToken` cookies |
| `GET /api/auth/me` | 🔐 | `?query`: one of `admin`/`host`/`user`... | full merged profile (person + role object) |

Notes:
- Login returns **401 "Invalid email or password"** for both a missing account and a wrong password (anti-enumeration).
- Rate limiter on login/refresh: **20 requests / 15 minutes / IP**.

### 3.2 User — `/api/user`

| Method & Path | Access | Body / Query | Response `data` |
|---|---|---|---|
| `GET /api/user` | 🛡️ | filters `searchTerm`, `role`, `email`; page/limit/sortBy/sortOrder | paginated persons (+ nested user/host/admin profile) |
| `GET /api/user/me` | 🔐 | — | same merged profile as `/auth/me` |
| `POST /api/user/create-user` | 🔓 | **multipart**: file(optional) + `data` = JSON string | created user |
| `POST /api/user/create-admin` | 🛡️ | **multipart**: file(optional) + `data` JSON | created admin |
| `POST /api/user/create-host` | 🛡️ | **multipart**: file(optional) + `data` JSON | created host |
| `PATCH /api/user/update-my-profile` | 🔐 | **multipart**: file(optional) + `data` JSON | updated profile |
| `GET /api/user/my-paid-events` | 👤 🛡️ | — | array of paid enrollments (see shape below) |

**Create-account `data` JSON shape** (all three):
```json
{
  "password": "secret",
  "user": {                       // or "admin" / "host"
    "name": "Str.",               // required
    "email": "a@b.c",             // required, unique
    "role": "USER",               // optional (defaults enforced server-side)
    "profilePhoto": "",           // optional — leave empty; upload via `file` field instead
    "contactNumber": "01xxxxxxxxx", // required
    "about": "",                  // optional
    "address": "",                // optional
    "gender": "MALE | FEMALE",    // required
    "interests": ["coding"]       // required
  }
}
```
The `file` field = a single image; it is uploaded to Cloudinary and its URL is set as `profilePhoto`.

**Update-my-profile `data` whitelist** (only these are accepted; anything else → 400): `name`, `profilePhoto`, `contactNumber`, `about`, `address`, `gender`, `interests` (array, max 10). `role`, `email`, `password`, `isDeleted` are **forbidden**.

**Multipart upload convention** (applies to all multer routes above and to event creation):
- Send `Content-Type: multipart/form-data`.
- JSON fields go inside a single form field literally named `data`, as a JSON **string**.
- The image (if any) goes in a field named `file`.
- If you send malformed JSON or omit `data`, you get a clean **400** (not 500).

**`get-my-paid-events` item shape:**
```json
{
  "participantId": "uuid", "joinedAt": "ISO", "joinStatus": "PENDING|ACCEPTED|...",
  "paid": true, "payment": { ... } | null,
  "event": { "id","title","type","location","dateTime","joiningFee","currency","status","images",
             "host": { "id","name","email","profilePhoto" } }
}
```

### 3.3 Event — `/api/event`

| Method & Path | Access | Body / Query | Response `data` |
|---|---|---|---|
| `POST /api/event/create-event` | 🏢 | **multipart**: `file`(optional) + `data` JSON | created event |
| `GET /api/event/events` | 🔓 | filters `type`, `location`, `searchTerm`; page/limit/sortBy/sortOrder | paginated events |
| `GET /api/event/host/my-created-events` | 🏢 | — | array of own events |
| `GET /api/event/:id` | 🔓 | — | event + host + participants + payments |
| `PATCH /api/event/update/:id` | 🏢/🛡️ (owner or admin) | whitelist JSON body | updated event |
| `DELETE /api/event/delete/:id` | 🏢/🛡️ (owner or admin) | — | `undefined` (200). **403/400 if paid participants exist** |
| `POST /api/event/:id/join` | 👤 | — | `{ participant, payment: null }` |
| `POST /api/event/:id/leave` | 👤 | — | `{ eventId, userEmail, refunded, needsRefund }` |
| `GET /api/event/:id/participants` | 🔐 | — | participant list (PII trimmed for non-hosts) |
| `POST /api/event/:id/review` | 👤 🛡️ | `{ rating: 1..5 int, comment?: <=500 }` | `{ event: {...}, review: {...} }` |
| `GET /api/event/host/:email` | 🔓 | — | host profile + their events |

**Create-event `data` JSON:**
```json
{
  "title": "min 4 chars",
  "type": "e.g. workshop",
  "description": "min 20 chars",
  "location": "Dhaka",
  "dateTime": "ISO string in the FUTURE (server rejects past)",
  "minParticipants": 5,        // optional
  "maxParticipants": 100,      // optional
  "joiningFee": 0,             // optional, must be >= 0 (0 = free)
  "currency": "BDT"            // optional
  // "images" is NOT accepted at creation; upload `file` instead (single image becomes images:[url])
}
```
`hostEmail` is taken from the authenticated host — cannot be forged via the body.

**Update-event whitelist** (`updateEventValidationSchema`, strict — unknown keys → 400): `title`, `type`, `description`, `location`, `dateTime` (future only), `minParticipants`, `maxParticipants`, `joiningFee` (>= 0), `currency`, `images`. `hostEmail` / `status` are **not settable** by this endpoint.

**join rules (server-enforced):**
- Event must exist, `status === OPEN`, not already started, and not your own event.
- No duplicate join (`@@unique([eventId,userEmail])` hard-blocks it → 409).
- Capacity counts only **ACCEPTED** participants; event auto-flips to `FULL` at capacity.
- Paid event → participant created `PENDING`, `paid: false` (waiting for payment).
- Free event → participant created `ACCEPTED`, `paid: true`.

**leave rules (server-enforced):**
- Cannot leave an event that already started.
- For paid enrollments: backend performs a **real Stripe refund**, marks the payment `REFUNDED`, then deletes the participant. Response tells you `refunded: true` or `needsRefund: true`.

**getParticipants access:**
- Host of that event / ADMIN → full `user` info (`name, email, profilePhoto, contactNumber, address, gender, interests`).
- USER → must be a participant of the event; receives only `name, email, profilePhoto` (PII trimmed).

**createReview rules:**
- Only after the event `dateTime` has passed.
- Reviewer must be a participant of that event.
- One review **per host** (reviews belong to hosts, not per-event).
- `rating` integer 1–5, comment ≤ 500 chars.

### 3.4 Payment — `/api/payment`

| Method & Path | Access | Body / Query | Response `data` |
|---|---|---|---|
| `POST /api/payment/init/:eventId` | 🔐 | — (body ignored) | `{ checkoutUrl, paymentId, checkoutSessionId }` |
| `GET /api/payment/verify` | 🔐 | `?session_id=...` | payment + participant status |
| `POST /api/payment/stripe/webhook` | Stripe-only (signature) | raw Stripe event | `{ received: true }` |

**The join → pay → success flow you must implement on the frontend:**

1. `POST /api/event/:id/join` → participant becomes `PENDING` (paid events).
2. `POST /api/payment/init/:eventId` → backend reuses or creates the payment, then creates a **Stripe Checkout session**. Returns `checkoutUrl`.
3. Redirect the user to `checkoutUrl` (Stripe-hosted page). Amount/currency always come from the event — the client cannot tamper.
4. Stripe redirects back to `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&eventId={eventId}` or `.../payment-cancel?...` (URLs are templated with the **exact** query params above).
5. On the success page, call `GET /api/payment/verify?session_id=...` to confirm. The backend polls Stripe if the payment is still PENDING and updates DB (payment → `SUCCESS`, participant → `ACCEPTED`, `paid: true`).
6. The webhook `checkout.session.completed` is the authoritative source; it is **idempotent** (only `PENDING → SUCCESS`). Never call any "manual" payment endpoint — there is none.

- `verify` also matches by `stripePaymentIntentId` if `session_id` isn't a session.
- **IDOR protected:** non-admin users can only read **their own** payments (C6).
- `init` on an already paid/accepted enrollment returns **400 "You have already paid for this event"**.

### 3.5 Host application — `/api/host`

| Method & Path | Access | Body | Response `data` |
|---|---|---|---|
| `POST /api/host/apply` | 👤 | `{ reason?, contactNumber?, address? }` | created application |
| `GET /api/host/my-applications` | 👤 | — | own applications (newest first) |
| `GET /api/host/admin/applications` | 🛡️ | — | all **PENDING** applications |
| `PUT /api/host/:applicationId/status` | 🛡️ | `{ status: "APPROVED"\|"REJECTED", feedback? }` | result object |

Flow:
- A USER applies to become a host → application `PENDING`.
- Admin approves → user is promoted to `HOST` (new `Host` row created, `Person.role` updated, the old `User` row soft-deleted, application deleted).
- Admin rejects → application is **kept** with `REJECTED` + `feedback` + `reviewedBy`/`reviewedAt`, so the user can still see the rejection reason.
- Applying is blocked for deactivated accounts, existing hosts/admins, and if a `PENDING` application already exists.

### 3.6 Admin — `/api/admin`

| Method & Path | Access | Notes |
|---|---|---|
| `GET /api/admin` | 🛡️ | paginated list of admins |
| `GET /api/admin/:id` | 🛡️ | person by uuid → `{ profile: {...} }` |
| `PATCH /api/admin/person/:id` | 🛡️ | update profile; whitelist = `name, profilePhoto, contactNumber, about, address, gender, interests` |
| `DELETE /api/admin/person/:id/soft` | 🛡️ | soft-delete (sets `isDeleted`) |
| `DELETE /api/admin/person/:id` | 🛡️ | **repointed to soft-delete** — no hard delete anymore |
| `GET /api/admin/users/all` | 🛡️ | paginated regular users |
| `GET /api/admin/hosts/all` | 🛡️ | paginated hosts |
| `GET /api/admin/persons/all` | 🛡️ | paginated persons + nested profile (filter by `role`, `searchTerm`, `isDeleted`) |
| `GET /api/admin/dashboard/stats` | 🛡️ | dashboard numbers |

**Dashboard stats shape:**
```json
{
  "stats": {
    "totalUsers": 10, "totalHosts": 3, "totalAdmins": 1,
    "totalEvents": 25, "totalPayments": 12, "totalRevenue": 12500
  },
  "recentPayments": [ { "id","amount","currency","status","createdAt",
                        "user": { "name","email" }, "event": { "title","hostEmail" } } ],
  "upcomingEvents":  [ { "id","title","dateTime","status", "host": { "name","email" },
                         "_count": { "participants": 5 } } ]
}
```

### 3.7 Review — `/api/review`

| Method & Path | Access | Notes |
|---|---|---|
| `GET /api/review` | 🔓 | all reviews, newest first, with reviewer + host names/photos |
| `GET /api/review/:hostEmail` | 🔓 | `{ host: {...}, reviews: [...] }` |

Review objects: `{ id, userEmail, hostEmail, rating, comment, createdAt }`, extended with `reviewer` / `host` summaries on list endpoints.

### 3.8 AI recommendation — `/api/recommendation`

| Method & Path | Access | Notes |
|---|---|---|
| `GET /api/recommendation/ai-recommendations` | 👤 | calls OpenRouter (GPT-3.5); falls back to most-popular events on failure |

Response `data` = array of max 6 items (always at least the "No upcoming events" placeholder object):
```json
{ "id": "uuid|null", "title": "...", "location": "...", "type": "...", "matchReason": "..." }
```

---

## 4. Pagination & filters (list endpoints)

Every list endpoint accepts the same query convention:
```
?page=1&limit=10&sortBy=createdAt&sortOrder=desc&searchTerm=...&type=...&location=...
```
- `page` : clamped to `>= 1` (default 1).
- `limit`: clamped to `1..100` (default 10).
- `sortBy` defaults to `createdAt`, `sortOrder` to `desc`.
- Search is case-insensitive `contains`; other query params become strict-equality filters.
- Available filters per list: persons `(`role`, `email`, `searchTerm`)`; events `(`type`, `location`, `searchTerm`)`; admins `(`searchTerm`, `gender`)`; users `(`searchTerm`, `gender`)`; hosts `(`searchTerm`, `gender`)`.

Paginated response always includes `meta: { page, limit, total }`.

---

## 5. Database schema (what the frontend technically persists)

Models (all in `prisma/schema/`): `Person`, `User`, `Host`, `Admin`, `HostApplication`, `Event`, `Participant`, `Payment`, `Review`.

Key relationships:
- Person 1—0..1 → User / Host / Admin (by email).
- User 1—N → HostApplication, Participant, Payment, Review.
- Host 1—N → Event, Review.
- Event 1—N → Participant, Payment.
- Participant N—1 → Payment (optional `paymentId`).
- `Participant` has `@@unique([eventId, userEmail])` — a user can join an event only once.

Enums: `UserRole` (USER/HOST/ADMIN), `Gender` (MALE/FEMALE), `EventStatus` (OPEN/FULL/CANCELLED/COMPLETED), `JoinStatus` (PENDING/ACCEPTED/REJECTED/LEFT), `PaymentStatus` (PENDING/SUCCESS/FAILED/REFUNDED), `HostApplicationStatus` (PENDING/APPROVED/REJECTED/CANCELLED).

> Frontend implication: event statuses you'll render are `OPEN`, `FULL`, `CANCELLED`, `COMPLETED`. Joining states are `PENDING` (paid, awaiting payment) vs `ACCEPTED` (in). Payment states are `PENDING` / `SUCCESS` / `FAILED` / `REFUNDED`.

---

## 6. Security hardening applied (from the review — already in code)

You can rely on these behaviours; they are intentional:

1. **No public payment-forging endpoint.** The signed Stripe webhook is the only way payment state changes. Never build "mark as paid" buttons.
2. **Amount & currency are server-side.** `init` ignores any client amount.
3. **Password hashes never leak** — all public-ish queries project explicit selects without `password` (`publicUserSelect` / `publicHostSelect`).
4. **Validation everywhere.** Event create/update, review, profile update, admin update are zod-whitelisted (`strict()` → rejects unknown keys). Join/leave/capacity/host-self/past-event business rules enforced.
5. **No user enumeration at login** (single 401 message), rate-limited login/refresh.
6. **Cookies**: httpOnly; `secure + SameSite=None` only in production (dev works over http).
7. **IDOR-safe payment verify** (users see only their own).
8. **Soft-delete preferred**; hard-delete routes were repointed.
9. **Refunds are real** — `leave`/event deletion paths account for Stripe money movement (event deletion even refuses while paid enrollments exist).
10. **Helmet** enabled (security headers), CORS restricted to the two frontend origins.

---

## 7. Gotchas / conventions to remember

- **Always send `credentials: 'include'` (fetch) or `withCredentials: true` (axios)** for anything authenticated.
- The only two allowed browser origins are `http://localhost:3000` and the Vercel frontend.
- **File uploads**: route through `multipart/form-data` with JSON in a `data` string field + image in `file`. Malformed JSON → 400.
- DateTime is always sent/received as ISO strings; the backend rejects past event datetimes.
- Money: `joiningFee` is an integer in the smallest unit *as entered by the host* (e.g. BDT). Stripe conversion multiplies by 100 server-side. Display `joiningFee` + `currency` as-is.
- Event list/detail responses include `_count: { payments, participants }` for capacity/interest UI.
- `GET /api/event/:id` includes full participant and payment arrays with public user info (no passwords, no hidden contact info beyond public fields).
- Reviews are **per host**, one per user/host pair — show aggregate rating by host across reviews.
- If a route isn't under `/api/<module>`, it does not exist → 404 envelope.

---

## 8. Testing & tooling (for the frontend dev to know)

- `npm test` → vitest suite (auth expiry parsing, pagination clamping, event/review zod schemas, global error handler). 31 tests, all green.
- `npm run check` → `tsc --noEmit` typecheck.
- No lint command exists. Prisma scripts are prefixed `db:` (see AGENTS.md).

---

## 9. Quick happiness path (smoke sequence)

1. `POST /api/auth/login` → save cookies.
2. `GET /api/auth/me` → see profile + role.
3. `GET /api/event/events` → browse (public).
4. `GET /api/event/:id` → event detail.
5. `POST /api/event/:id/join` → join (free events are instantly `ACCEPTED`).
6. Paid event → `POST /api/payment/init/:eventId` → redirect `checkoutUrl` → on return `GET /api/payment/verify?session_id=...`.
7. `POST /api/event/:id/review` after the event date passes.
8. `GET /api/user/my-paid-events` → paid tickets.
9. Hosts: `POST /api/event/create-event`, `GET /api/event/host/my-created-events`.
10. Users wanting to become hosts: `POST /api/host/apply` → admin: `PUT /api/host/:applicationId/status`.