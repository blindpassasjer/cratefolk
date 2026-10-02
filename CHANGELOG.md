# Changelog

## 0.3.3

### Added
- **Trivia on record pages.** Each record shows a "Did you know?" box with facts from the album's Wikipedia article (recording, charts, sales, background). Results are cached, nothing is shown when no article is found, and the box links to its source. No API key is needed.
- **Cover size slider** on the collection, remembered in your browser.
- **Format badges** on covers for CDs, cassettes and video releases.
- **Clear button** in the Add record search.
- Illustrated empty states, a drawn fallback disc for covers without art, and a record backdrop on the sign-in page.

### Changed
- Account, donate, theme and sign-out moved from the sidebar to the top bar. On phones, account and sign-out sit at the bottom of the sidebar drawer.
- The main area uses the full width, and the cards on the Account page share a uniform grid.
- The README describes WaxCrate as a vinyl, CD and cassette manager.
- Removing the last copy of a record returns you to the collection. A hand-added record is deleted along with its last copy, after a confirmation, so it can't be left unreachable.

### Fixed
- Changing `ADMIN_EMAIL` no longer leaves the previous admin account with the admin role. Any other admin is demoted to a regular user on start.
- A failed load no longer leaves a stale error on the collection, wishlist and record pages after the next load succeeds.
- Removed unused code.

### Upgrading
A new `trivia` table is created automatically on the first start. Looking up trivia sends the artist and title of the record you open to Wikipedia.
