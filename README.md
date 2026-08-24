# 📚 Myaarchive — Web & Mobile Reading Library

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK_54-000000.svg?logo=expo)](https://expo.dev)
[![Turso Database](https://img.shields.io/badge/Database-Turso_libSQL-00E599.svg)](https://turso.tech)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare_R2-F38020.svg?logo=cloudflare)](https://www.cloudflare.com)
[![Clerk Auth](https://img.shields.io/badge/Auth-Clerk-6C47FF.svg?logo=clerk)](https://clerk.com)

**Myaarchive** is a personal reading library and manga/book tracker built for readers, collectors, and archivers. It offers an interactive way to manage reading progress, character relationship maps, cloud galleries, and volume notes across web browsers, desktop, and mobile devices.

---

## ✨ Features Showcase

### 📖 Title & Volume Tracking
- **Multi-Volume Series & Standalone Books**: Track manga, light novels, comic series, and single standalone novels.
- **Reading Status & Progress**: Sort titles into *Planning*, *Reading*, *Finished*, and *Re-read*.
- **Volume Notes & Thoughts**: Capture chapter notes, volume reviews, and reading dates.

### 🕸️ Interactive Character Relationship Map
- **Character Profiles**: Track main/side character roles, appearances, and bio notes.
- **Visual Network Graph**: Automatically generates interactive character relationship networks (powered by `vis-network`).

### ☁️ Cloud Storage & Multi-Device Sync
- **Instant Cloud Sync**: Powered by **Turso (libSQL)** for low-latency database replication.
- **R2 Asset Storage**: Upload high-res book covers, gallery artwork, and document attachments via **Cloudflare R2**.
- **Multi-User Isolation**: User accounts and libraries are isolated with **Clerk Authentication**.

### 📱 Cross-Platform Companion
- **Web & Desktop App**: Modern dark theme with dynamic color palettes and fluid UI.
- **Expo Mobile App**: Built for iOS and Android with native Expo Router navigation.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Web Frontend** | HTML5, Vanilla CSS3, JavaScript, `vis-network` |
| **Database** | Turso (libSQL / Cloud SQLite) |
| **Cloud Storage** | Cloudflare R2 (S3-Compatible API) |
| **Authentication** | Clerk (JWT & OAuth) |
| **Desktop Runtime** | Electron |
| **Mobile Runtime** | Expo SDK 54 (React Native & Expo Router) |

---

## 🚀 Quick Start Guide

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/myaarchive.git
cd myaarchive
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
# Database (Turso)
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token

# Authentication (Clerk)
CLERK_SECRET_KEY=sk_test_your_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key

# Object Storage (Cloudflare R2)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
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

3. **Build Desktop Binary**:
   ```bash
   npm run build
   ```

---

## 📱 Mobile App Setup (iOS & Android)

1. **Navigate to `mobile/`**:
   ```bash
   cd mobile
   npm install
   ```

2. **Start Expo Dev Server**:
   ```bash
   npx expo start -c
   ```

3. **Open on Mobile**:
   - Install **Expo Go** on your device.
   - Scan the QR code printed in your terminal.

---

## 🌐 Deployment Options

### Self-Hosting Web Version
The web frontend can be deployed to **Netlify**, **Vercel**, or **Cloudflare Pages**.

1. Connect your GitHub repository to Netlify/Vercel.
2. Set the environment variables listed above in your platform's dashboard.
3. Deploy!

---

## 📄 License

This project is licensed under the **ISC License**.
