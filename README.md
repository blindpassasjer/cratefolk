<p align="center"><img src="apps/web/public/favicon.svg" alt="" width="96"></p>

# WaxCrate

A self-hosted vinyl collection manager. Your database is the source of truth; Discogs is the metadata source.

> Status: early development. Accounts, the admin dashboard, adding records from Discogs (by search, catalog number or barcode) and browsing your collection work; instant search over your collection is next.

## Run with Docker

The image is published to GitHub Container Registry as `ghcr.io/blindpassasjer/waxcrate` (`linux/amd64` and `linux/arm64`). Tags: `latest` and `X.Y.Z` for releases.

```sh
cp .env.example .env   # set ADMIN_EMAIL and ADMIN_PASSWORD
docker compose up -d
```

Open http://localhost:6170 and sign in with the admin credentials. Data lives in the `waxcrate-data` volume (SQLite). If you use `env_file: .env`, do not put `DATA_DIR` or `PORT` in it, and keep `DATA_DIR: /data` under `environment:` so nothing can redirect the database outside the volume.

- The admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on every start, and its password is re-synced from the environment, so changing the variable and restarting is how you reset it.
- There is no public sign-up. The admin creates accounts under **Users**.
- Set `COOKIE_SECURE=true` when serving over HTTPS.
- Set `DISCOGS_TOKEN` (a personal access token from https://www.discogs.com/settings/developers). It works without one, but Discogs then allows fewer requests per minute and withholds search thumbnails.

## Development

```sh
npm install
export ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-me-please
npm run dev        # API on :6170, web on :5173 (proxies /api)
```

Layout: `apps/server` (Hono + SQLite), `apps/web` (React + Vite + Tailwind).

## Support

WaxCrate is free and open source. If it's useful to you, you can [buy me a coffee](https://buymeacoffee.com/blindpassasjer) or [Vipps me](https://qr.vipps.no/box/d4cd2440-08dd-4eb9-b6b1-88130f984233/pay-in).
