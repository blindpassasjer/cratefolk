# WaxCrate

A self-hosted vinyl collection manager. Your database is the source of truth; Discogs is the metadata source.

> Status: early development. Accounts and the admin dashboard work; Discogs integration, the collection views and search are next.

## Run with Docker

```sh
cp .env.example .env   # set ADMIN_EMAIL and ADMIN_PASSWORD
docker compose up -d
```

Open http://localhost:3000 and sign in with the admin credentials. Data lives in the `waxcrate-data` volume (SQLite).

- The admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on every start, and its password is re-synced from the environment, so changing the variable and restarting is how you reset it.
- There is no public sign-up. The admin creates accounts under **Users**.
- Set `COOKIE_SECURE=true` when serving over HTTPS.

## Development

```sh
npm install
export ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-me-please
npm run dev        # API on :3000, web on :5173 (proxies /api)
```

Layout: `apps/server` (Hono + SQLite), `apps/web` (React + Vite + Tailwind).
