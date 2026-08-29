# 📚 Myaarchive — Personal Reading Library

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Turso Database](https://img.shields.io/badge/Database-Turso_libSQL-00E599.svg)](https://turso.tech)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare_R2-F38020.svg?logo=cloudflare)](https://www.cloudflare.com)
[![Electron](https://img.shields.io/badge/Runtime-Electron-47848F.svg?logo=electron)](https://www.electronjs.org)

**Myaarchive** is a personal reading library and manga/book tracker built for readers, collectors, and archivers — an interactive way to manage reading progress, character relationship maps, cloud galleries, and volume notes, from a desktop app.

---

## ✨ Features

### 📖 Title & Volume Tracking
- **Multi-Volume Series & Standalone Books**: Track manga, light novels, comic series, and single standalone novels.
- **Reading Status & Progress**: Sort titles into *Planning*, *Reading*, *Finished*, and other custom statuses you define.
- **Volume Notes & Thoughts**: Capture chapter notes, volume reviews, and reading dates.
- **Additional Details** *(all optional)*: Date started/finished reading, book type (Web Novel, Manga, Graphic Novel, etc.), 1–5 star rating, original language & country of origin, language read, author(s) & artist(s), year published (with per-volume publication dates for series), status in country of origin, English licensing & translation status, and original/English publisher.

### 🕸️ Interactive Character Relationship Map
- **Character Profiles**: Track main/side character roles, appearances, and bio notes.
- **Visual Network Graph**: Automatically generates interactive character relationship networks (powered by `vis-network`).

### ☁️ Cloud Storage & Sync
- **Cloud Database**: Powered by **Turso (libSQL)**, synced to a local embedded replica for fast, offline-capable reads.
- **R2 Asset Storage**: Book covers, gallery artwork, and file attachments are uploaded to **Cloudflare R2**.
- **Multi-User Accounts**: Simple built-in username/password accounts (`auth/localAuth.js`) keep each person's libraries isolated within the same database.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **UI** | HTML5, Vanilla CSS3, JavaScript, `vis-network` |
| **Runtime** | Electron |
| **Database** | Turso (libSQL / Cloud SQLite), embedded replica |
| **Cloud Storage** | Cloudflare R2 (S3-compatible API) |

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
