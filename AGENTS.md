# AGENTS.md

## Stack

Express 5 + TypeScript (strict) + Prisma 7 (Postgres) + zod. Modular monolith: each module (`src/app/modules/<name>/`) splits interface / validation / service / controller / routes. Routes are mounted under `/api/<module>` in `src/app/routes/index.ts`.

There is no eslint config, despite eslint being in devDependencies — do not invent a lint command. There IS a vitest suite (`npm test`).

## Commands

- `npm run dev` — ts-node-dev with `--respawn --transpile-only` on `src/server.ts`
- `npm run build` (tsc → `dist/`); `npm start` runs `node ./dist/server.js`
- Typecheck: `npm run check` (= `npx tsc --noEmit`)
- Tests: `npm test` (= `vitest run`; unit tests cover auth-expiry parsing, pagination clamping, event/review zod schemas, and the global error handler)
- Prisma: use the npm scripts — every one passes `--schema=./prisma/schema`, which is a **directory** of multi-file `.prisma` schemas (not a single `schema.prisma`). `db:push`, `db:migrate`, `db:pull`, `db:studio`, `db:generate`.
- `postinstall` runs `prisma generate`, so `npm install` on a fresh clone regenerates the client automatically.

## Prisma 7 specifics

- The datasource URL comes from `prisma.config.ts` (`env('DATABASE_URL')`), **not** from the schema file.
- `@prisma/client` is instantiated with the `PrismaPg` driver adapter over a `pg.Pool` in `src/app/utils/prisma.ts`. Keep this pattern; a bare `new PrismaClient()` without an adapter will not match the generated client.
- The generated client lives in gitignored `generated/prisma/`. If typecheck suddenly fails on `@prisma/client` imports, run `npm run db:generate`.

## Env

`src/app/config/env.ts` throws at import time if any of the 17 required vars is missing from `.env`. `.env` is gitignored but present locally with live secrets (Neon Postgres, Stripe, Cloudinary, OpenRouter). Never commit it.

## Non-obvious wiring

- `server.ts` calls `seedAdmin()` on boot — creates the admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars (idempotent).
- The Stripe webhook route `/api/payment/stripe/webhook` is registered with `express.raw()` **before** `express.json()` in `src/app.ts` (raw body required for signature verification). Don't move it after the parsers.
- `auth` middleware (`src/app/middlewares/auth.ts`) reads the token from the `accessToken` cookie first, falling back to `Authorization: Bearer <token>`.
- File uploads: multer writes to `uploads/` (gitignored, keep `.gitkeep`), then `fileUploader.uploadToCloudinary` pushes to Cloudinary and deletes the local file. `uploads/` is created at runtime if missing.
- `src/app/modules/recommendation/` calls the OpenRouter API (`openai/gpt-3.5-turbo`) for AI event recommendations; requires `OPENROUTER_API_KEY`.
- CORS whitelist: `http://localhost:3000` and the Vercel frontend only.
- Deploy: `render-build.sh` runs `prisma generate` → `npm run build` → `prisma migrate deploy`.

## Style notes

- tsconfig enforces `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — indexing arrays/objects yields `T | undefined`, and optional object fields must be explicitly `undefined` when omitted.
- Code style is intentionally loose (heavy `console.log` debugging in auth/file-upload/seed paths); match surrounding style, don't "clean up" existing logs.