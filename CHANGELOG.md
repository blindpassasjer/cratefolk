# Changelog

## 0.6.0 (2026-10-04)

### Added
- **Discogs sync.** Account → Discogs lets each user connect their own Discogs account with a personal access token (Cratelog never asks for your password; the token is stored encrypted on the server). **Sync now** merges your collection and wantlist in both directions: records missing on either side are added, and for copies on both, grades and notes follow whichever side changed since the last sync (Cratelog wins if both did). Records you add, wishlist, grade or annotate in Cratelog are also sent to Discogs as you make them, which you can switch off ("Send changes to Discogs"). Records added by hand are never sent.
- **Optionally sync deletions.** "Also sync deletions" (off by default) carries removals over: a record you delete here is removed from Discogs at the next sync, and one you remove on Discogs is removed here. If Discogs seems to be missing a large share of your records, the sync stops and changes nothing. Either way, a record you delete no longer comes back at the next sync.
- **Scan a barcode to add a record.** The Add record dialog has a scan button that opens your camera, reads the barcode on the sleeve and runs the search for you. It needs HTTPS (or `localhost`), so the button is hidden over plain HTTP and in the demo. Safari and Firefox load a small decoder the first time you scan.

### Changed
- **Account page is laid out in two columns** (from tablet width up) and grouped into sections under Sign-in, Preferences and Privacy headings, each with a short description.
- **Reworked Users section for admins.** Registration, new user and the user list now share one card, and the table is a compact list with a "⋯" menu per user.
- **One reset dialog for passwords.** "Reset password…" lets an admin either set a new password or create a one-time link, instead of two separate actions.

### Fixed
- The Vinylpladen shop link now opens the shop's current search page.
- Added the standard `mobile-web-app-capable` meta tag, which removes a console warning in Chrome.

### Upgrading
Database migrations run automatically on start (Discogs connection, sync bookkeeping). Back up `data/` first: older versions can't read a migrated database. The new `data/secret.key` encrypts users' saved Discogs tokens, so include it in your backups and keep them private.

## 0.5.2 (2026-10-03)

### Added
- **Choose your shop links.** Account → Shop links lets you pick which shops get "Also search" links on your wishlist and record pages: eBay, Bandcamp, Amazon, Vinylpladen, Platekompaniet, FINN.no, Tradera, CDON, HHV, Deejay.de, Record Shop X, Juno, Rough Trade, Norman, Boomkat and Amoeba. The links open each shop's own search, so no prices are shown. eBay and Bandcamp stay on by default.

### Changed
- **Faster, smoother record grids, especially in Safari.** Grids now load small 480px covers instead of the full-size images (the record page still shows the full one). The small copies are made on first view and saved next to the originals in `data/covers`, so existing collections need no migration. The sticky header no longer blurs what scrolls under it, cover shadows are lighter, and the server now compresses API and app responses.

### Upgrading
A database migration runs automatically on start (a new shops preference). Back up `data/` first: older versions can't read a migrated database.

## 0.5.1 (2026-10-03)

### Added
- The **cover size slider** is now also on the Wishlist, shared links and friends' pages. The size is shared with the Collection, so it stays the same everywhere.

## 0.5.0 (2026-10-03)

### Added
- **Friends' activity feed.** A collapsible "Friends' activity" section at the bottom of the sidebar shows what friends recently added, wishlisted, put up for sale and sold, with covers and how long ago. A badge shows how many items are new since you last opened it. You only see activity for what each friend shares (wishlist events need their wishlist setting, the rest their collection setting), and never prices or grades. Records added by hand are never shown. The feed keeps the last 90 days.
- **Opt out of the feed.** Account → Sharing has a new checkbox to leave your activity out of other people's feeds. It is on by default, only matters if you share your collection or wishlist, and hides your past activity too.
- **Mark as sold.** A copy that is for sale now has a "Mark as sold" button on its record page. It removes the copy from your collection (and from a co-owner's) and posts "sold" to the feed.
- The demo has made-up feed entries.

### Upgrading
Database migrations run automatically on start (a new events table and a sharing preference). Back up `data/` first: older versions can't read a migrated database.

## 0.4.2 (2026-10-03)

### Added
- **NOK** is now a currency choice. Discogs doesn't offer NOK for marketplace prices, so those still show in EUR when NOK is selected; your own asking prices are in NOK.

### Changed
- The **Members** page is now called **Friends** (sidebar, page, Account → Sharing).

### Fixed
- Opening a record from a friend's collection and pressing the back link now returns to that friend's page instead of your own collection.

## 0.4.1 (2026-10-03)

### Added
- **Open or close registration.** Under Account → Users, the admin can switch registration on. While it is open, the sign-in page offers "Create one" (name, email, password); new accounts are regular users and are signed in straight away. It is closed by default, so existing installs behave as before. Registration attempts are rate-limited per IP.
- **Browse friends' collections.** Under Account → Sharing, each user can let their friends browse their collection and/or wishlist (both off by default). The new **Friends** page in the sidebar lists everyone who opted in and shows a read-only grid with search and filters. Grades, notes and prices are never shown.
- **Shared ownership.** On a record's page, choose "Shared with" on a copy you added to co-own it with a friend. The copy appears in both collections with a "Shared" badge, counts in both stats and exports, and either owner can edit it. If the person who added it deletes it, it goes for both; the co-owner can only remove it from their own collection. Shared copies can't be filed into the other person's crates, and share links and for-sale lists still use only the person who added the copy.

### Changed
- **One search box for adding records.** The Search / Catalog # / Barcode tabs are gone. A run of 8–14 digits is searched as a barcode, anything else as free text, and if free text finds nothing it is retried as a catalog number.

### Upgrading
Database migrations run automatically on start (a settings table, and new columns for shared copies and sharing preferences). Back up `data/` first, as always: older versions can't read a migrated database.

## 0.4.0 (2026-10-03)

### Changed
- **WaxCrate is now Cratelog.** The name, logo text, page titles, installable app name, Excel export file names and the demo all use the new name. The Docker image moves to `ghcr.io/blindpassasjer/cratelog` and the demo to `/cratelog/`. The old `waxcrate` image no longer receives updates.

### Upgrading
Update the image name in your `docker-compose.yml` to `ghcr.io/blindpassasjer/cratelog:latest` (or `git pull`), then run `docker compose pull && docker compose up -d --remove-orphans`. Your `data/` folder and `.env` are unchanged. On first start `data/waxcrate.db` is renamed to `data/cratelog.db`, and signed-in sessions, the theme and the cover size carry over. Back up `data/` first: older versions can't find the renamed database. See the README for details.

## 0.3.4 (2026-10-03)

### Changed
- Every record page now has something in its "Did you know?" box. If the album has no Wikipedia article, it shows facts from the artist's article (headed "About" and the artist's name). If that is missing too, it shows facts worked out from the record itself: its age, track count and runtime, longest track, label and country, genre, and how many records by the artist you own.

### Upgrading
A new `artist_trivia` table is created automatically on the first start. Looking up trivia now also sends the artist's name to Wikipedia.

## 0.3.3 (2026-10-03)

### Added
- **Trivia on record pages.** Each record shows a "Did you know?" box with facts from the album's Wikipedia article (recording, charts, sales, background). Results are cached, nothing is shown when no article is found, and the box links to its source. No API key is needed.
- **Stats page** with your collection broken down by decade, format, genre, country, artist and label, what you added each month, the estimated marketplace value and the value of what you have for sale.
- **Sidebar navigation.** All records, For sale, your crates, Wishlist and Stats live in a sidebar (a drawer on phones). Crates can be created and managed from it.
- **Edit and delete hand-added records**, with a warning when you add a record that is already in your collection.
- **Password reset links.** An admin can create a one-time link (valid for 24 hours) for a user who forgot their password.
- **Installable app.** A web app manifest, icons and a service worker let you add Cratelog to your home screen.
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
- The README describes Cratelog as a vinyl, CD and cassette manager.

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
