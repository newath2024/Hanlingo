# Hanlingo

## Shared Neon setup

Use this setup when you want local machines and Render to share the same Hanlingo data.

### Environment variables

Copy `.env.example` to `.env` and set:

```env
DATABASE_URL="postgresql://...pooler.../neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://...ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
SESSION_SECRET="replace-with-a-long-random-secret-at-least-32-characters"
SESSION_COOKIE_SECURE="false"
HANLINGO_DEV_FILE_STORE="false"
```

Notes:

- `DATABASE_URL` is for the running app. With Neon, use the pooled connection string.
- `DATABASE_URL` is also the first URL Prisma CLI will use for migrations in this repo.
- `DIRECT_URL` is an optional fallback if `DATABASE_URL` is missing.
- `HANLINGO_DEV_FILE_STORE="false"` switches the app away from `.local-data/dev-auth-store.json`.
- Local `.env` is ignored by git. Configure the same values manually on every machine.

### Local setup

Install dependencies, run migrations once against the shared database, then start the app:

```bash
npm install
npm run prisma:migrate:deploy
npm run dev
```

Open `/register` and create one Hanlingo account. Use that same account on every machine.

### Render setup

Add the same shared database configuration to your Render service:

```env
DATABASE_URL=...pooled-url...
DIRECT_URL=...direct-url...
SESSION_SECRET=...same-secret-as-local...
SESSION_COOKIE_SECURE=true
HANLINGO_DEV_FILE_STORE=false
```

Then redeploy. If the database is new, run:

```bash
npm run prisma:migrate:deploy
```

### Start-fresh behavior

This repository can also store progress in `.local-data/dev-auth-store.json` when
`HANLINGO_DEV_FILE_STORE="true"`. That local file is not migrated automatically.
If you switch to Neon with `HANLINGO_DEV_FILE_STORE="false"`, you are starting with a new app account unless you write a separate migration from the file store into Postgres.
