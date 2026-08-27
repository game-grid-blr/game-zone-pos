# Fort Game Zone POS

A production-oriented first version of a POS and timed game-session manager for Fort Game Zone.

## What It Includes

- Desktop/tablet-first dashboard with large live cards for each table.
- Timestamp-based timers using `startedAt`, `endsAt`, and status, so timers survive refresh, reload, tab inactivity, and device sleep/wake.
- Audible warning and expiry alarms using browser-compatible Web Audio, with notification support when permitted.
- Fast POS booking flow with customer details, payment method, discount, tax, configurable pricing, and bill generation.
- Extension logic for active and `TIME_UP` sessions, with extension payments and transaction history.
- Printable receipt layout suitable for thermal printers and A4.
- Transaction history with filters, receipt reprint, cancel, refund, and audit trail entries.
- Daily/monthly reports, revenue breakdowns, payment totals, cancellation/refund counts, and CSV export.
- Admin settings for tables, pricing, durations, tax, receipt text, business details, alarm frequency, warning time, currency, and payment methods.
- Simple staff authentication with `ADMIN` and `STAFF` roles.
- Prisma relational schema with foreign keys, indexes, and an `ActiveTableLock` unique constraint to prevent two active sessions on one table.
- PWA manifest and service worker shell caching.

## Setup

### Local SQLite Development

```bash
pnpm install
cp .env.example .env
# Edit .env so DATABASE_URL="file:./dev.db" for local SQLite.
pnpm prisma:generate:sqlite
pnpm db:setup:sqlite
pnpm seed:sqlite
pnpm dev
```

Open http://localhost:3000.

## Seeded Users

- Admin username: `admin`, password: `<SET_ADMIN_PASSWORD>`
- Staff username: `staff`, password: `<SET_STAFF_PASSWORD>`

Set `AUTH_SECRET`, `SEED_ADMIN_PASSWORD`, and `SEED_STAFF_PASSWORD` before seeding. Do not commit real passwords or secrets.

## Testing

```bash
pnpm test
```

The local SQLite test suite covers 15/30/60-minute sessions, timer reconstruction from timestamps, dashboard reopen during active sessions, expiry to `TIME_UP`, active and expired extensions, table concurrency, idempotent start/payment behavior, Asia/Kolkata daily revenue boundaries, history search, receipt summary generation, cancel/refund accounting, and admin/staff permission helpers.

To run the same service tests against a disposable PostgreSQL database:

```bash
$env:TEST_DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/fort_game_zone_test?sslmode=require"
$env:ALLOW_DESTRUCTIVE_TEST_RESET="true"
pnpm test:postgres
```

The PostgreSQL test database will be migrated and wiped during the test run.

## Production Notes

PostgreSQL is the production Prisma datasource. SQLite is retained for local development through `prisma/schema.sqlite.prisma` and `scripts/setup-db.cjs`.

Required production environment variables:

- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `BUSINESS_TIMEZONE=Asia/Kolkata`

Production database setup:

```bash
pnpm prisma:generate:postgres
pnpm db:migrate:deploy
pnpm seed:postgres
```

One-time import from the preserved SQLite database:

```bash
$env:SQLITE_SOURCE_PATH="prisma/dev.db"
pnpm db:import:sqlite
pnpm db:verify:migration
```

Deploy the app with:

```bash
pnpm prisma:generate:postgres
pnpm build
pnpm start
```

Recommended deployment:

- Supabase Postgres for the managed database, using a Prisma-specific database user.
- Vercel for the Next.js application, with all secrets stored as Vercel environment variables.
- `DATABASE_URL` should use the production runtime PostgreSQL connection. For serverless hosting, use the provider-recommended pooled connection.
- `DIRECT_URL` should use the direct PostgreSQL connection for Prisma migrations.
- Keep the existing custom cookie authentication for now. Set a strong `AUTH_SECRET` and use private seeded passwords.
- Keep the existing PWA manifest/service worker; Vercel serves the static PWA files from `public/`.
- For a future Windows installation, package a browser shortcut or lightweight desktop shell that points to the hosted app. Do not return to local-only SQLite for multi-device production use.
