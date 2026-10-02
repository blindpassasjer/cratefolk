# Changelog

## 0.3.3 (2026-10-03)

### Added
- **Trivia on record pages.** Each record shows a "Did you know?" box with facts from the album's Wikipedia article (recording, charts, sales, background). Results are cached, nothing is shown when no article is found, and the box links to its source. No API key is needed.
- **Stats page** with your collection broken down by decade, format, genre, country, artist and label, what you added each month, the estimated marketplace value and the value of what you have for sale.
- **Sidebar navigation.** All records, For sale, your crates, Wishlist and Stats live in a sidebar (a drawer on phones). Crates can be created and managed from it.
- **Edit and delete hand-added records**, with a warning when you add a record that is already in your collection.
- **Password reset links.** An admin can create a one-time link (valid for 24 hours) for a user who forgot their password.
- **Installable app.** A web app manifest, icons and a service worker let you add WaxCrate to your home screen.
- **Cover size slider** on the collection, remembered in your browser.
- **Format badges** on covers for CDs, cassettes and video releases.
- **Clear button** in the Add record search.
- Search on shared pages, and long lists load in chunks as you scroll.
- Illustrated empty states, a drawn fallback disc for covers without art, and a record backdrop on the sign-in page.
- `TRUST_PROXY` setting for running behind a reverse proxy (see the README).

### Changed
- Account, donate, theme and sign-out moved to the top bar. On phones, account and sign-out sit at the bottom of the sidebar drawer.
- User management moved into the Account page, and the main area uses the full width. The cards on the Account page share a uniform grid.
- The header and page headers fit better on phones.
- Removing the last copy of a record returns you to the collection. A hand-added record is deleted along with its last copy, after a confirmation, so it can't be left unreachable.
- The Docker image is also published as `:latest` on every push to `main`. The build is faster and stricter: a native build stage, Node 22, a health check and image tags with the commit SHA.
- The README describes WaxCrate as a vinyl, CD and cassette manager.

### Fixed
- Changing `ADMIN_EMAIL` no longer leaves the previous admin account with the admin role. Any other admin is demoted to a regular user on start.
- Hand-added records are private to the user who made them. Other accounts can no longer see or use them.
- Login throttling also limits attempts per IP address, and only trusts `X-Forwarded-For` when `TRUST_PROXY=true`.
- A slow or unreachable Discogs no longer blocks the request queue. It now reports a clear error after a timeout.
- A failed load no longer leaves a stale error on the collection, wishlist and record pages after the next load succeeds.
- Removed unused code.

### Upgrading
A new `trivia` table and an owner column for hand-added records are created automatically on the first start. Looking up trivia sends the artist and title of the record you open to Wikipedia.

## 0.3.2 (2026-10-02)

### Added
- Add records by hand when they aren't on Discogs, with an optional cover image, tracklist and genres.

## 0.3.1 (2026-10-02)

### Added
- Filtering and sorting on the Wishlist.
- A live demo on GitHub Pages, with sample records and real covers from the Cover Art Archive.
- A rewritten README with screenshots, quick start and build instructions, and an Apache-2.0 license.

### Changed
- Data is stored in `./data` next to `docker-compose.yml`.
- The Docker `edge` image channel was removed.

### Fixed
- The "For sale" chip never showed in the collection, the price badge overlapped the cover text, and share links ignored the base path.

## 0.3.0 (2026-10-02)

### Added
- **For-sale copies:** mark a copy for sale with an asking price. It shows on the record page, as a badge and a "For sale" filter in the collection, in the Excel export, and through a public "for sale" share link (grades and prices are included, notes stay private).
- **Instant search** on the Collection and Wishlist. It ignores accents and case, and matches artist, title, label, catalog number, country, format, year and barcode. The query is kept in the URL.
- A Manage collections dialog for renaming and deleting crates. Deleting a crate keeps its records.
- Toast and dialog notifications instead of browser prompts.

### Changed
- The search dialog on the Wishlist page only offers "Add to wishlist" (or "You own this"), instead of adding to the collection.

## 0.2.1 (2026-10-02)

### Added
- A new logo (an amber crate with a record rising out of it), used as the header mark, favicon and README icon.
- A Buy me a coffee menu with Vipps and Buy Me a Coffee links.
- An Account page to change your name, email and password. Changing the password signs out your other devices.

### Fixed
- The light theme was not applied.

## 0.2.0 (2026-10-02)

### Added
- Light and dark theme toggle, following the OS by default.
- Marketplace prices on the wishlist and record pages (lowest price and copies for sale), shown in a per-user currency.
- Collections (crates): group your records, with a picker on each record. Deleting a crate never deletes records.
- Excel (.xlsx) export, and public read-only share links for all records, one crate or the wishlist. Shared pages are marked `noindex`.

### Fixed
- Data was not persisted when `.env` was passed through `env_file`.

## 0.1.0 (2026-10-02)

### Added
- Accounts with an admin created from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and an admin dashboard to manage users.
- Discogs search by text, catalog number or barcode, with request rate limiting.
- Collection with Goldmine/Discogs grading per copy, a record page, and a wishlist with "Got it" to move records into the collection.
- A Docker image published to GHCR, with the default port 6170.
