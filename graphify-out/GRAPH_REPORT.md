# Graph Report - cratefolk  (2026-10-06)

## Corpus Check
- 70 files · ~117,476 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 729 nodes · 1295 edges · 53 communities (48 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `16ab3353`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 29 edges
2. `useAuth()` - 19 edges
3. `Changelog` - 17 edges
4. `db` - 15 edges
5. `useDialog()` - 15 edges
6. `load()` - 14 edges
7. `requireUser()` - 12 edges
8. `AppEnv` - 11 edges
9. `ensureRelease()` - 11 edges
10. `runSync()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `coverFile()` --calls--> `sharp`  [INFERRED]
  apps/server/src/releases.ts → apps/server/package.json
- `resetLookup()` --calls--> `sha256()`  [EXTRACTED]
  apps/server/src/routes/auth.ts → apps/server/src/auth.ts
- `Layout()` --calls--> `useAuth()`  [EXTRACTED]
  apps/web/src/Layout.tsx → apps/web/src/auth.tsx
- `ResetPassword()` --calls--> `useToast()`  [EXTRACTED]
  apps/web/src/pages/ResetPassword.tsx → apps/web/src/notify.tsx
- `manualOwned()` --calls--> `isCreator()`  [EXTRACTED]
  apps/server/src/routes/collection.ts → apps/server/src/releases.ts

## Communities (53 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (43): Collection(), Friend(), FriendView, Item, FriendSummary, Shared(), SharedItem, SharedView (+35 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (41): barcode, Body, c, catno, counts, decades, DEMO_FEED, discogsId (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (29): Account, accountFor(), Action, addToCollection(), CollectionItem, CopyValues, decide(), Field (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (26): cleanName(), CURRENCIES, Currency, discogsRequest(), downloadImage(), fetchDiscogs(), fetchMarketStats(), fetchRelease() (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (26): Backups, Behind a reverse proxy / HTTPS, Build it yourself, code:sh (git clone https://github.com/blindpassasjer/cratefolk.git), code:sh (docker compose up -d), code:sh (git pull                  # if you cloned the repo, to pick ), code:sh (docker compose stop), code:sh (git clone https://github.com/blindpassasjer/cratefolk.git) (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (22): addSchema, body, condition, copies, copy, CopyRow, discogsId, dupe (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (23): dependencies, lucide-react, react, react-dom, react-router-dom, @zxing/browser, @zxing/library, devDependencies (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (19): authRoutes, collectionRoutes, releaseRoutes, marketRoutes, statusRoutes, wishlistRoutes, purgeExpiredSessions(), config (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (21): acquired, acquireSchema, addSchema, copyId, currency, fetchedAt, grade, id (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.10
Nodes (17): User, AuthContext, AuthProvider(), AuthState, ACCENT, ActiveDialog, ConfirmOptions, DialogApi (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (21): dependencies, better-sqlite3, exceljs, hono, @hono/node-server, sharp, zod, devDependencies (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (20): albumLookup(), artistLookup(), cached(), CacheSpec, dataFacts(), factsFrom(), findArticle(), fold() (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (12): resetDemo(), Release(), CollectionTotals, CratesContext, CratesProvider(), CratesState, useCrates(), Layout() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (17): devDependencies, concurrently, engines, node, license, name, private, scripts (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (14): acct, email, failures, info, ip, loginSchema, parsed, passwordSchema (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (11): Account(), DiscogsSync(), SyncStatus, AdminUsers(), ResetPasswordDialog(), AdminUser, CollectionGroup, CURRENCIES (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (10): CAA_IDS, demoCover(), esc(), realCover(), wrap(), manualCover(), RELEASES, Cover() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (12): existing, groupId, Kind, parsed, publicShareRoutes, releaseId, res, share (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (13): copiesPerRelease, Counted, d, decades, forSale, key, months, n (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.21
Nodes (9): Mode, Grade, GRADES, OwnedCopy, SearchResponse, SearchResult, Status, Trivia (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (11): Column, columns, COMMON, discogsUrl(), exportRoutes, g, joinJson(), Row (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.24
Nodes (14): passwordMatches(), createSession(), destroyOtherSessions(), destroySession(), ensureAdmin(), hashPassword(), LEGACY_COOKIES, lookupUser() (+6 more)

### Community 22 - "Community 22"
Cohesion: 0.19
Nodes (9): LinkDiscogs(), ManualRecord(), nextTrack(), SIDES, splitPosition(), Track, useDialog(), Kind (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (12): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (12): adminRoutes, createSchema, exists, id, info, parsed, patchSchema, target (+4 more)

### Community 25 - "Community 25"
Cohesion: 0.28
Nodes (12): coverFile(), coverPath(), coversDir, createManualRelease(), deleteManualRelease(), ensureRelease(), linkManualRelease(), ManualRelease (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.24
Nodes (12): addCopy(), clash(), cleanName(), fail(), group(), groupRow(), load(), manualRecord() (+4 more)

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, outDir, rootDir, skipLibCheck (+3 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (10): 0.1.0 (2026-10-02), 0.3.0 (2026-10-02), 0.3.2 (2026-10-02), 0.5.1 (2026-10-03), Added, Added, Added, Added (+2 more)

### Community 29 - "Community 29"
Cohesion: 0.18
Nodes (9): clash, copyId, groupRoutes, id, info, nameSchema, parsed, res (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (8): discogsRoutes, events, Friend, friendRoutes, friends, releaseId, AppEnv, searchReleases()

### Community 31 - "Community 31"
Cohesion: 0.31
Nodes (5): Login(), ResetPassword(), Logo(), Theme, ThemeToggle()

### Community 32 - "Community 32"
Cohesion: 0.29
Nodes (6): CATALOG, daysAgo(), DemoState, seedState(), StoredCopy, ReleaseDetail

### Community 33 - "Community 33"
Cohesion: 0.29
Nodes (5): AddRecord(), canScan(), Detector, DetectorCtor, FORMATS

### Community 34 - "Community 34"
Cohesion: 0.40
Nodes (5): 0.3.3 (2026-10-03), Added, Changed, Fixed, Upgrading

### Community 35 - "Community 35"
Cohesion: 0.40
Nodes (5): 0.6.0 (2026-10-04), Added, Changed, Fixed, Upgrading

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (4): 0.3.1 (2026-10-02), Added, Changed, Fixed

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (4): 0.4.1 (2026-10-03), Added, Changed, Upgrading

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (4): 0.5.2 (2026-10-03), Added, Changed, Upgrading

### Community 39 - "Community 39"
Cohesion: 0.50
Nodes (4): 0.4.2 (2026-10-03), Added, Changed, Fixed

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (4): copyRow(), release(), releaseFields(), wishRow()

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (3): 0.2.0 (2026-10-02), Added, Fixed

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (3): 0.3.4 (2026-10-03), Changed, Upgrading

### Community 43 - "Community 43"
Cohesion: 0.67
Nodes (3): 0.7.0 (2026-10-04), Changed, Upgrading

### Community 44 - "Community 44"
Cohesion: 0.67
Nodes (3): 0.2.1 (2026-10-02), Added, Fixed

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (3): 0.5.0 (2026-10-03), Added, Upgrading

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (3): 0.4.0 (2026-10-03), Changed, Upgrading

## Knowledge Gaps
- **348 isolated node(s):** `name`, `private`, `version`, `license`, `type` (+343 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `coverFile()` connect `Community 25` to `Community 17`, `Community 10`, `Community 5`, `Community 30`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `sharp` connect `Community 10` to `Community 25`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _348 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07462686567164178 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1032258064516129 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._