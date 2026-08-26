# 📚 Myaarchive — Web & Mobile Reading Library

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK_54-000000.svg?logo=expo)](https://expo.dev)
[![Turso Database](https://img.shields.io/badge/Database-Turso_libSQL-00E599.svg)](https://turso.tech)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare_R2-F38020.svg?logo=cloudflare)](https://www.cloudflare.com)

**Myaarchive** is a personal reading library and manga/book tracker built for readers, collectors, and archivers. It offers an interactive way to manage reading progress, character relationship maps, cloud galleries, and volume notes across web browsers, desktop, and mobile devices.

---

## 🌐 Try the Web App

You can access the live hosted web application directly in your browser:

👉 **[Launch Myaarchive Web App](https://myaarchive.netlify.app)**

*No installation required for regular readers! Simply open the link, sign in or enter guest mode, and start tracking your library.*

---

## ✨ Features Showcase

### 📖 Title & Volume Tracking
- **Multi-Volume Series & Standalone Books**: Track manga, light novels, comic series, and single standalone novels.
- **Reading Status & Progress**: Sort titles into *Planning*, *Reading*, *Finished*, and other custom statuses you define.
- **Volume Notes & Thoughts**: Capture chapter notes, volume reviews, and reading dates.
- **Additional Details** *(all optional)*: Date started/finished reading, book type (Web Novel, Manga, Graphic Novel, etc.), 1–5 star rating, original language & country of origin, language read, author(s) & artist(s), year published (with per-volume publication dates for series), status in country of origin, English licensing & translation status, and original/English publisher.

### 🕸️ Interactive Character Relationship Map
- **Character Profiles**: Track main/side character roles, appearances, and bio notes.
- **Visual Network Graph**: Automatically generates interactive character relationship networks (powered by `vis-network`).

### ☁️ Cloud Storage & Multi-Device Sync
- **Instant Cloud Sync**: Powered by **Turso (libSQL)** for low-latency database replication.
- **R2 Asset Storage**: Upload high-res book covers, gallery artwork, and document attachments via **Cloudflare R2**.
- **Multi-User Isolation**: User accounts and libraries are isolated with **Clerk Authentication**.


---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Web Frontend** | HTML5, Vanilla CSS3, JavaScript, `vis-network` |
| **Database** | Turso (libSQL / Cloud SQLite) |
| **Cloud Storage** | Cloudflare R2 (S3-Compatible API) |
| **Desktop Runtime** | Electron |
| **Mobile Runtime** | Expo SDK 54 (React Native & Expo Router) |

---

## 🛠️ Developer & Self-Hosting Setup

> **Note for Developers**: If you want to clone this repository to self-host your own instance or contribute to development, follow the steps below.

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/myaarchive.git
cd myaarchive
```

---

## 💻 Web & Desktop App Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Desktop App**:
   ```bash
   npm start
   ```

---


## 📄 License

This project is licensed under the **ISC License**.
