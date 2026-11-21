# Running Cratefolk on Cloudflare

Cratefolk can run on [Cloudflare Workers](https://developers.cloudflare.com/workers/) instead of Docker. It is the same app and the same
API; only the storage changes:

| | Docker | Cloudflare |
|---|---|---|
| Database | SQLite file in `data/` | [D1](https://developers.cloudflare.com/d1/) (SQLite, hosted by Cloudflare) |
| Covers | `data/covers/` | [R2](https://developers.cloudflare.com/r2/) bucket |
| Cover thumbnails | made with sharp | made with the [Images](https://developers.cloudflare.com/images/) binding (optional) |
| Web app | served by the server | Workers static assets |
| Discogs sync | runs in the server process | runs in a [Queue](https://developers.cloudflare.com/queues/) consumer (it can take minutes) |
| Cleanup of old sessions | a timer | a cron trigger every 6 hours |
| Encryption key for Discogs tokens | `data/secret.key` | the `SECRET_KEY_RAW` secret |

The Docker setup is unchanged and keeps working; the Worker lives in `apps/worker` and shares the server code. You need a Cloudflare
account with Workers, D1, R2 and Queues available (Queues and Images may need a paid Workers plan; check Cloudflare's current plans).

You need Node.js 22 or newer for wrangler.

## First deploy

```sh
git clone https://github.com/blindpassasjer/cratefolk && cd cratefolk
npm ci                        # the web app and the shared server code
cd apps/worker && npm ci      # wrangler

npx wrangler login
npm run db:create             # creates the D1 database, the R2 bucket and the Queue
```

`wrangler d1 create` prints a `database_id`. Put it in [`apps/worker/wrangler.jsonc`](../apps/worker/wrangler.jsonc) as
`"database_id"` on the `d1_databases` entry. Then set the admin account and deploy:

```sh
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put DISCOGS_TOKEN      # optional, see the README's configuration table

npm run deploy                # builds the web app, applies database migrations, deploys
```

Open the `*.workers.dev` address wrangler prints and sign in. A custom domain can be added under the Worker's Settings → Domains &
Routes. Sessions use a secure cookie (`COOKIE_SECURE=true` is preset), so use the HTTPS address.

Later deploys are the same `npm run deploy`. Migrations are applied by `wrangler d1 migrations apply`, which remembers what has run, so
new releases that add a migration are picked up automatically.

## Moving an existing instance (Docker → Cloudflare)

Your data is a database file plus a folder of covers plus a key. All three move over; nothing is converted lossily and passwords keep
working. Your Docker instance is only read, never changed, so you can go back to it at any point.

1. **Do the first deploy above**, so the schema exists (the data is loaded into it).
2. **Export the database.** From `apps/worker`, point it at your `data/cratefolk.db`:

   ```sh
   npm run export:data -- /path/to/data/cratefolk.db cratefolk-data.sql
   ```

   This makes a consistent copy (even if the app is running), upgrades the copy to the current schema, and writes plain SQL. Sessions
   are left out, so everyone signs in once more.
3. **Import it.**

   ```sh
   npx wrangler d1 execute cratefolk --remote --file=cratefolk-data.sql
   ```

   Do this on a fresh database. Running it twice fails on duplicate IDs rather than doubling your data.
4. **Upload the covers:**

   ```sh
   npm run upload:covers -- /path/to/data/covers
   ```

   Only the originals are uploaded; thumbnails are made again on demand. wrangler starts once per file, so thousands of covers take a
   while. For a big library `rclone` is faster: create an R2 API token, configure an `s3` remote for your account, and
   `rclone copy data/covers r2:cratefolk-covers/covers --include "[0-9]*.jpg" --include "-[0-9]*.jpg"` (skip the `*.thumb.jpg`).
5. **Carry over the encryption key**, so users' saved Discogs tokens stay readable instead of having to be entered again:

   ```sh
   npx wrangler secret put SECRET_KEY_RAW < /path/to/data/secret.key
   ```

   If you used the `SECRET_KEY` variable on Docker, set the same `SECRET_KEY` secret instead. If a key is wrong or missing, the Worker
   logs a warning that the stored token can't be decrypted, and treats that user as not connected to Discogs; nothing is lost, they can just reconnect.
6. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the same values as before (the first deploy already did), sign in, and check your
   collection. Then switch your domain or bookmarks over and stop the Docker container.

## Auto-deploy from GitHub (optional)

Once the first deploy and the data move are done, Cloudflare can build and deploy on every push ([Workers
Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)). Don't use it for the first deploy: the D1 database, R2 bucket and Queue
have to exist first (`npm run db:create`), and the `database_id` has to be committed in `wrangler.jsonc`.

In the dashboard: Workers & Pages → your `cratefolk` Worker → Settings → Builds → Connect, pick the GitHub repository, then set:

| Setting | Value |
|---|---|
| Root directory | the repository root (not `apps/worker`: the Worker imports `apps/server` and `apps/web`) |
| Build command | `npm ci && npm run build -w @cratefolk/web && cd apps/worker && npm ci && npm run migrations` |
| Deploy command | `cd apps/worker && npx wrangler d1 migrations apply cratefolk --remote && npx wrangler deploy` |
| Build variable | `NODE_VERSION` = `22` (wrangler needs Node 22 or newer; the repo's `.nvmrc` says the same) |

Notes:

- The Worker must be named `cratefolk`, matching `"name"` in `wrangler.jsonc`. If the names differ, the build fails or deploys a second Worker.
- Secrets stay on the Worker (`wrangler secret put`); don't put them in the build variables.
- The deploy command applies database migrations before deploying, so a release that adds a migration upgrades your live database as part of its
  own deploy. Migrations only ever add to the schema, but keep a D1 backup habit: `npx wrangler d1 export cratefolk --remote --output backup.sql`.
- Pushes to the connected branch deploy it. Use a different branch for work in progress, or switch off builds for non-production branches in
  the same settings page.

## Developing against the Worker locally

```sh
cd apps/worker
printf 'ADMIN_EMAIL=me@example.com\nADMIN_PASSWORD=change-me-please\nCOOKIE_SECURE=false\n' > .dev.vars
npm run dev                   # wrangler dev with a local D1 and R2, on http://localhost:8787
```

`.dev.vars` is git-ignored. Local state lives in `apps/worker/.wrangler/`. `npm run build:web` (or `npm run build` in the repo root) must
have been run at least once so there is a web app to serve.

## Limits worth knowing

- **Discogs sync of very large collections.** A sync runs in one queue consumer, which Cloudflare limits to 15 minutes. Discogs allows
  about one request a second and a sync makes several per new record, so a first import of many thousands of records may be cut off.
  Syncs are incremental: press **Sync now** again and it carries on where the last one stopped.
- **Thumbnails** need the Images binding. Without it (remove the `images` block from `wrangler.jsonc`) grids load the full-size covers.
- **One region of D1.** Cloudflare places the database near where it is created; requests from far away pay for that round trip.
