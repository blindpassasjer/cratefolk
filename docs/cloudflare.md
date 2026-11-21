# Running Cratefolk on Cloudflare

Cratefolk can run on [Cloudflare Workers](https://developers.cloudflare.com/workers/) instead of Docker. It is the same app and the same
API; only the storage changes:

| | Docker | Cloudflare |
|---|---|---|
| Database | SQLite file in `data/` | [D1](https://developers.cloudflare.com/d1/) (SQLite, hosted by Cloudflare), tables created by the Worker itself |
| Covers | `data/covers/` | [R2](https://developers.cloudflare.com/r2/) bucket |
| Cover thumbnails | made with sharp | made with the [Images](https://developers.cloudflare.com/images/) binding (optional) |
| Web app | served by the server | Workers static assets |
| Discogs sync | runs in the server process | runs in a [Queue](https://developers.cloudflare.com/queues/) consumer (it can take minutes) |
| Cleanup of old sessions | a timer | a cron trigger every 6 hours |
| Encryption key for Discogs tokens | `data/secret.key` | generated and kept in the database (or `SECRET_KEY`) |

The Docker setup is unchanged and keeps working; the Worker lives in `apps/worker` and shares the server code. You need a Cloudflare
account with Workers, D1, R2 and Queues available (Queues and Images may need a paid Workers plan; check Cloudflare's current plans).

Everything below can be done in the Cloudflare dashboard and the Cratefolk web app. No command line is needed.

## 1. Create the Worker from GitHub

1. In the [dashboard](https://dash.cloudflare.com): **Workers & Pages → Create → Import a repository**, and pick your Cratefolk repository
   on GitHub (your own fork or copy of it).
2. Use these settings:

   | Setting | Value |
   |---|---|
   | Worker name | `cratefolk` (it must match `"name"` in [`wrangler.jsonc`](../wrangler.jsonc)) |
   | Root directory | the repository root (leave it as it is) |
   | Build command | leave empty or the default |
   | Deploy command | leave the default, `npx wrangler deploy` (the web app is built by wrangler itself, see `"build"` in `wrangler.jsonc`) |
   | Build variable | only if the build complains about the Node version: `NODE_VERSION` = `22` (wrangler needs Node 22 or newer; `.nvmrc` says the same) |

3. Save and deploy. The first deploy creates the D1 database, the R2 bucket and the Queue and binds them (the Worker's configuration
   names them but has no ids on purpose), and the Worker creates its own tables when it first starts.

   If the first build complains that it can't create a resource, create it yourself in the dashboard (D1 database `cratefolk`, R2 bucket
   `cratefolk-covers`, Queue `cratefolk-sync`), put the D1 `database_id` in `wrangler.jsonc` next to `"database_name"`, commit, and build again.

4. Open the Worker → **Settings → Variables and Secrets** and add:

   | Name | Type | Value |
   |---|---|---|
   | `ADMIN_EMAIL` | variable | the admin's email (if you are moving an instance: the same as before) |
   | `ADMIN_PASSWORD` | secret | the admin's password |
   | `DISCOGS_TOKEN` | secret | optional, see the README's configuration table |

   Saving redeploys the Worker. Open its `*.workers.dev` address (or add your own domain under Settings → Domains & Routes) and sign in.
   The session cookie is secure-only (`COOKIE_SECURE=true` is preset), so use the HTTPS address.

From now on, every push to the connected branch builds and deploys. Secrets stay on the Worker; don't put them in the build variables. Use a
different branch for work in progress, or switch off builds for non-production branches in Settings → Builds.

## 2. Moving an existing Docker instance

Your data is a database file, a folder of covers and a key. All of it moves over from the web app, and your Docker instance is only read,
never changed, so you can go back to it at any point.

1. **Stop the Docker container** (`docker compose stop`), so `cratefolk.db` is complete. A running instance keeps recent changes in a
   side file that a plain copy would miss.
2. Sign in to the new Worker as the admin, open **Account**, and find **Import from another Cratefolk** at the bottom of the right column.
   It only appears while the installation is still empty.
3. Choose, from the old `data` folder:
   - `cratefolk.db`, the database (required),
   - the `covers` folder (optional; without it records show no cover art),
   - `secret.key` (optional; with it, people's saved Discogs connections keep working, otherwise they reconnect).
4. Press **Import**. The file is read in your browser and sent over in pieces; a progress line shows where it is. When it says
   **Import finished**, everyone signs in again. Passwords, users, records, wishlists, crates, share links and friends' settings are all
   carried over, and share links keep working. Sessions are not, so each person signs in once more.

Notes:

- The admin account always follows `ADMIN_EMAIL` and `ADMIN_PASSWORD` of the Worker, as on Docker. If the old admin used another email, that
  account becomes a normal user with its own old password and all its records.
- If something fails halfway, the page says so. Pressing **Import** again clears what was imported so far and starts over.
- An import only works into an empty installation, and only once. That keeps it from overwriting anything.
- The encryption key for Discogs tokens is generated on first start and kept in the database, because a Worker has no data folder. If you
  would rather keep it outside the database, set a `SECRET_KEY` secret before importing, and the imported tokens are encrypted with that.

## Developing against the Worker locally

```sh
(cd apps/worker && npm ci)
printf 'ADMIN_EMAIL=me@example.com\nADMIN_PASSWORD=change-me-please\nCOOKIE_SECURE=false\n' > .dev.vars
(cd apps/worker && npm run dev)                 # wrangler dev with a local D1 and R2, on http://localhost:8787
```

`.dev.vars` is git-ignored and local state lives in `.wrangler/`, both in the repo root. The web app is built for you. Use Node 22 or newer. `npm run deploy` in `apps/worker` deploys from your own machine instead of GitHub; it
needs `wrangler login` or a `CLOUDFLARE_API_TOKEN`.

## Limits worth knowing

- **Discogs sync of very large collections.** A sync runs in one queue consumer, which Cloudflare limits to 15 minutes. Discogs allows
  about one request a second and a sync makes several per new record, so a first import of many thousands of records may be cut off.
  Syncs are incremental: press **Sync now** again and it carries on where the last one stopped.
- **Thumbnails** need the Images binding. Without it (remove the `images` block from `wrangler.jsonc`) grids load the full-size covers.
- **One region of D1.** Cloudflare places the database near where it is created; requests from far away pay for that round trip.
