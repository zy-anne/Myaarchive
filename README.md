<div align="center">

# 📚 Myaarchive

### *A personal reading library with a "Twilight Reading Room" soul.*

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Turso Database](https://img.shields.io/badge/Database-Turso_libSQL-00E599.svg)](https://turso.tech)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare_R2-F38020.svg?logo=cloudflare)](https://www.cloudflare.com)
[![Electron](https://img.shields.io/badge/Runtime-Electron-47848F.svg?logo=electron)](https://www.electronjs.org)

<img src="docs/screenshots/hero.png" alt="Myaarchive library view in dark mode" width="900">

</div>

**Myaarchive** is a personal reading library and manga/book tracker: reading progress, character relationship maps, cloud galleries, volume notes, and reading statistics, all in a desktop app with a hand-built, themeable interface.

It's a solo project: one shared Turso database and one shared Cloudflare R2 bucket, with every account's data isolated by `owner_id` scoping rather than separate infrastructure per person. It can be packaged and handed to friends and family to use as their own private library.

---

## 🖼️ Take a Tour

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/library-table.png" alt="Library table view"><br><sub><b>Library (table)</b>: dense, sortable, filterable</sub></td>
    <td width="50%"><img src="docs/screenshots/library-gallery.png" alt="Library gallery view"><br><sub><b>Library (gallery)</b>: cover-forward grid</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/series-detail.png" alt="Title detail page"><br><sub><b>Title page</b>: details, volumes, characters, gallery, files, glossary</sub></td>
    <td><img src="docs/screenshots/relationship-graph.png" alt="Character relationship graph"><br><sub><b>Relationship graph</b>: interactive, color-coded by relationship type</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/character-lore.png" alt="Character lore drawer"><br><sub><b>Character Lore</b>: portrait, vibes, "Appears vs. Reality"</sub></td>
    <td><img src="docs/screenshots/volume-notes.png" alt="Volume sticky-note board"><br><sub><b>Volume notes</b>: sticky-note board and chapter-notes timeline</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/reading-stats.png" alt="Reading statistics dashboard"><br><sub><b>Reading Statistics</b>: annual goal, streaks, heatmap, genre radar</sub></td>
  </tr>
</table>

### 🎨 Six palettes, light & dark

<table>
  <tr>
    <td><img src="docs/screenshots/theme-twilight.png" alt="Twilight Reading Room"><br><sub>Twilight Reading Room</sub></td>
    <td><img src="docs/screenshots/theme-sakura.png" alt="Sakura Blossom"><br><sub>Sakura Blossom</sub></td>
    <td><img src="docs/screenshots/theme-purple.png" alt="Mysterious Purple"><br><sub>Mysterious Purple</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/theme-pink.png" alt="Pink Lemonade Bliss"><br><sub>Pink Lemonade Bliss</sub></td>
    <td><img src="docs/screenshots/theme-green-latte.png" alt="Green Strawberry Latte"><br><sub>Green Strawberry Latte</sub></td>
    <td><img src="docs/screenshots/theme-saffron.png" alt="Saffron Serenity"><br><sub>Saffron Serenity</sub></td>
  </tr>
</table>

> 🎬 **Demo:** drop a short GIF at `docs/screenshots/demo.gif` and embed it with `![Demo](docs/screenshots/demo.gif)`.

---

## ✨ Features

### 📖 Title & Volume Tracking
- **Multi-Volume Series & Standalone Books** — track manga, light novels, comic series, and single standalone novels side by side.
- **Reading Status & Progress** — sort titles into *Planning*, *Reading*, *Finished*, or any fully custom statuses you define, each with its own color.
- **Volume Notes & Thoughts** — capture chapter notes, volume reviews, and reading dates per volume (or overall/chapter thoughts for standalones).
- **Additional Details** *(all optional)* — date started/finished, book type (Web Novel, Manga, Graphic Novel, etc.), 1–5 star rating, original language & country of origin, language read, author(s) & artist(s), year published (with per-volume publication dates), status in country of origin, English licensing & translation status, and original/English publisher.
- **Library / Gallery Views** — switch between a dense sortable table and a cover-forward gallery grid, with sorting by title, author, year, or rating in either view.
- **Powerful Filtering** — filter by status, genre, tag, rating, publication year range, book type, language, country of origin, translation status, author, artist, and publisher, with Any/All matching for genre+tag combos.
- **Custom Categories** — organize titles into your own top-level categories (libraries) with a custom icon or uploaded image.
- **Series Groups & Shared Universes** — link sequels, prequels, spin-offs, and companion titles into collapsible umbrella cards, each with a role (Main Story, Side Story, Prequel…).
- **Content Warnings & NSFW Control** — per-user content-warning vocabulary, an NSFW flag per title, and a global setting to hide NSFW titles entirely.
- **Fanfic Support** — a multi-value Fandom field appears automatically when Book Type is "Fanfic".
- **Transfer & Copy** — move or duplicate a title (optionally with volumes, characters, and gallery) between categories.
- **Quick Actions** — one-click "Mark Started / Finished Today" and click-to-edit dates right on the title page.

### 🕸️ Interactive Character Relationship Map
- **Character Profiles** — track main/side character roles, volume appearances, portraits, and bio notes.
- **Visual Network Graph** — automatically generates an interactive, theme-aware character relationship network (powered by `vis-network`), with colored edges by relationship type (Friend, Rival, Family, Enemy, Romance, Mentor, Other) and custom labels.

### 📊 Reading Statistics
- **Annual Milestone** — set a yearly goal and see progress, pace (ahead/behind), and a monthly-velocity sparkline.
- **Reading Timeline** — pick a year or a single month: per-month bar charts, a daily activity heatmap, weekly breakdowns, and most-read genre/tag/title insights.
- **Streaks & Consistency** — current streak, longest streak, longest break, and consistency percentage.
- **Reading Profile Radar** — a genre "DNA" chart of what you actually read most.
- **Breakdowns** — status, top genres, top tags, rating distribution, and titles finished per year.
- All charts are plain HTML/CSS/SVG — no charting library.

### 🖼️ Gallery & Files
- **Per-Title Image Gallery** — drag-and-drop fan art, photos, or other images, with captions and manual drag-to-reorder.
- **File Attachments** — attach PDFs, notes, or any other file to a title and open it in the OS default app.
- **Links** — attach external URLs (with optional labels) alongside uploaded files.
- **Glossary** — a per-title list of in-world terms, honorifics, and lore definitions.

### ☁️ Cloud Storage & Sync
- **Cloud Database** — powered by **Turso (libSQL)**, synced to a local embedded replica for fast, offline-capable reads and writes.
- **R2 Asset Storage** — book covers, character portraits, gallery images, and file attachments are uploaded to **Cloudflare R2**, with a local disk cache so repeat reads are instant.
- **Self-Healing Sync** — if the local database replica ever drifts out of sync with the remote primary, the app automatically rebuilds it and retries rather than surfacing a confusing error.
- **Multi-User Accounts** — simple local username/password accounts (bcrypt-hashed, no external auth provider) keep each person's libraries, tags, and statuses fully isolated within the same shared database.
- **JSON Export** — back up your whole library (categories, titles, volumes, characters, relationships, gallery, and file references) at any time.

### 🎛️ Personalization & Quality of Life
- **Six color palettes** × light/dark mode, applied before first paint to avoid theme flash.
- **Auto-hide categories drawer** for maximum library space.
- **Drag-to-reorder** categories (sidebar) and gallery pictures.
- **Default start view** — reopen on your last category, a pinned category, or the Statistics page.
- **Custom reading statuses & tags** — rename, recolor, and delete, with usage counts before you delete.
- **Chapter-notes timeline** — write notes one node at a time and read them back as a vertical timeline.
- **Keyboard shortcuts** — `Ctrl/⌘ + N` adds whatever's relevant to the current screen (title, volume, character, picture, file); `Esc` closes the top-most modal or drawer.
- **Account safety** — change password, optional security question for password recovery, and a typed-confirmation Delete Account flow that wipes all of your data (including R2 objects).

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **UI** | HTML5, vanilla CSS3, vanilla JavaScript, `vis-network` |
| **Runtime** | Electron |
| **Database** | Turso (libSQL / cloud SQLite), embedded replica via `@libsql/client` |
| **Cloud Storage** | Cloudflare R2 (S3-compatible, via `@aws-sdk/client-s3`) |
| **Auth** | Local username/password (bcryptjs), session persisted via Electron `safeStorage` (OS keychain) |
| **Packaging** | `electron-builder` (NSIS installer for Windows) |

### Architecture at a glance

```
main.js            Electron main process — window, IPC handlers, schema bootstrap & recovery
preload.js          Context-isolated bridge exposing window.api to the renderer
app.js               Renderer UI logic (vanilla JS, no framework)
index.html / style.css   Markup & "Twilight Reading Room" theme

data-layer/
  client.js          libSQL client factory (desktop embedded replica vs. remote HTTP client)
  index.js           Platform-agnostic data layer — every query, keyed by owner_id where relevant

auth/
  localAuth.js        Username/password sign-up & sign-in (bcrypt-hashed, stored in Turso)

storage/
  r2.js                Cloudflare R2 upload/download/delete helpers (S3-compatible API)
  cache.js             Local disk cache for downloaded R2 assets, with size-based eviction
```

`data-layer/index.js` has no Electron dependency — it's plain functions over a libSQL client — so it's designed to be reusable unmodified by a future mobile (Expo) client; only `data-layer/client.js` would need a platform-specific swap.

### 🔧 Engineering Highlights

| Challenge | Approach |
| :--- | :--- |
| **Fast + offline-capable reads** | Turso *embedded replica*: reads hit a local libSQL file, writes replicate to the remote primary. |
| **Replica drift / corruption** | Errors like `WalConflict` or a malformed schema are detected, the local replica is rebuilt from the primary, and the failed operation retries automatically (`withDbRecovery` in `main.js`). |
| **Multi-user isolation on one backend** | Every query is scoped by `owner_id` directly or through library ownership; single-record reads join through `libraries.owner_id` so IDs can't be guessed across accounts. |
| **Safe schema evolution** | Idempotent, additive migrations on every launch (`ensure*` functions) including a rebuild path for the old global tags/statuses tables. |
| **Fewer disk commits per save** | Series create wraps tag/genre/warning upserts in a single transaction instead of a dozen individual commits. |
| **Heavy image traffic** | R2 object keys stored in the DB, a size-capped on-disk asset cache, plus an in-memory LRU of data URLs. |
| **Secure sessions** | Session persisted with Electron `safeStorage` (OS keychain); destructive actions re-verify the password. |
| **Platform-agnostic data layer** | `data-layer/index.js` has zero Electron dependencies, so it's reusable by a future mobile client. |

---

## 🛠️ Setup

### 1. Clone the repository

```bash
git clone https://github.com/zy-anne/myaarchive.git
cd myaarchive
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up your `.env` file

Create a file named `.env` in the project root (same folder as `package.json`) with:

```env
# Turso (libSQL) — your remote database
TURSO_DATABASE_URL=libsql://your-database-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Cloudflare R2 — S3-compatible object storage
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-r2-bucket-name
```

This one set of credentials is shared by every account that signs up in the app — isolation between people is enforced by the app's own `owner_id` scoping, not by separate databases or buckets.

### 4. Run in development

```bash
npm start
```

On first launch, the schema is created automatically against your Turso database (safe to run repeatedly — every migration is additive or idempotent).

### 5. Build an installer

```bash
npm run build
```

This packages the app with `electron-builder` (NSIS installer on Windows) and bundles your `.env` into the app's resources, so anyone you share the installer with can sign up and use the same shared backend without needing their own credentials.

---

## 🔐 Notes on Auth & Isolation

- Accounts are plain username/password, stored locally in the shared Turso database (`auth/localAuth.js`), hashed with bcrypt — no external identity provider.
- Every table that holds personal data (`libraries`, `tags`, `statuses`, `series`, and everything hanging off a series) is scoped to the signed-in user, either directly via `owner_id` or transitively through library ownership.
- Genres are the one exception — they're shared/global across all accounts.
- Sessions are persisted between launches using Electron's `safeStorage` API (backed by the OS keychain), so signing in once doesn't require re-authenticating every time the app opens.
- Because the installer bundles the `.env` (including Turso and R2 credentials), anyone holding the installer can extract those credentials. Only share builds with people you trust.

---

## 🗺️ Roadmap

- [x] Multi-user accounts with password recovery
- [x] Cloudflare R2 asset storage with local cache
- [x] Reading statistics dashboard
- [x] Series groups & shared universes
- [ ] Mobile companion app (Expo) using the shared data layer
- [ ] Import from other trackers (CSV / MyAnimeList / Goodreads)
- [ ] PDF reading-log export

---

## 🙋 About

Built by [@zy-anne](https://github.com/zy-anne) as a solo project. Feedback and ideas are welcome — please open an issue.

---

## 📦 License

ISC