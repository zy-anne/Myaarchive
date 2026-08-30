# 📚 Myaarchive — Personal Reading Library

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Turso Database](https://img.shields.io/badge/Database-Turso_libSQL-00E599.svg)](https://turso.tech)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare_R2-F38020.svg?logo=cloudflare)](https://www.cloudflare.com)
[![Electron](https://img.shields.io/badge/Runtime-Electron-47848F.svg?logo=electron)](https://www.electronjs.org)

**Myaarchive** is a personal reading library and manga/book tracker — an interactive way to manage reading progress, character relationship maps, cloud galleries, and volume notes, from a desktop app with a "Twilight Reading Room" aesthetic.

It's built as a solo project: one shared Turso database and one shared Cloudflare R2 bucket, with every account's data isolated by `owner_id` scoping rather than separate infrastructure per person. That means it can be packaged and handed to friends/family to use as their own private library, all backed by the same app.

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

### 🕸️ Interactive Character Relationship Map
- **Character Profiles** — track main/side character roles, volume appearances, portraits, and bio notes.
- **Visual Network Graph** — automatically generates an interactive, theme-aware character relationship network (powered by `vis-network`), with colored edges by relationship type (Friend, Rival, Family, Enemy, Romance, Mentor, Other) and custom labels.

### 🖼️ Gallery & Files
- **Per-Title Image Gallery** — drag-and-drop fan art, photos, or other images, with captions and manual drag-to-reorder.
- **File Attachments** — attach PDFs, notes, or any other file to a title and open it in the OS default app.

### ☁️ Cloud Storage & Sync
- **Cloud Database** — powered by **Turso (libSQL)**, synced to a local embedded replica for fast, offline-capable reads and writes.
- **R2 Asset Storage** — book covers, character portraits, gallery images, and file attachments are uploaded to **Cloudflare R2**, with a local disk cache so repeat reads are instant.
- **Self-Healing Sync** — if the local database replica ever drifts out of sync with the remote primary, the app automatically rebuilds it and retries rather than surfacing a confusing error.
- **Multi-User Accounts** — simple local username/password accounts (bcrypt-hashed, no external auth provider) keep each person's libraries, tags, and statuses fully isolated within the same shared database.
- **JSON & PDF Export** — back up your whole library (or a printable reading log) at any time.

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

---

## 📦 License

ISC