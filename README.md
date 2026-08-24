# 📚 Myaarchive — Personal Reading Library

**Myaarchive** is a personal reading library and manga/book tracker application. It allows readers to track series, standalone books, reading progress, characters, character relationships, image galleries, and file attachments in a unified interface.

Built with a shared **libSQL / Turso** database layer, **Cloudflare R2** storage, **Clerk Authentication**, and cross-platform clients (Desktop App + Expo Mobile App).

---

## ✨ Features

- **📚 Series & Standalone Support**: Track both multi-volume manga/light novel series and standalone books.
- **📊 Reading Progress & Status**: Organize titles into *Planning*, *Reading*, *Finished*, and *Re-read*.
- **👥 Character Relationship Graph**: Add character profiles, roles, notes, and view interactive relationship maps powered by `vis-network`.
- **🖼️ R2 Cloud Attachments & Gallery**: Upload covers, gallery images, and document attachments synced to Cloudflare R2 object storage.
- **🏷️ Flexible Tagging & Genres**: Categorize titles with custom tags and genres supporting boolean (`AND` / `OR`) filter modes.
- **📂 Custom Libraries**: Create custom libraries/categories with custom icons and positions.
- **🔒 Multi-User & Secure**: Powered by Clerk Auth — user libraries are fully isolated per user account (`owner_id`).
- **📱 Mobile Companion App**: Includes an Expo SDK 54 React Native app (`mobile/`) for Android and iOS devices.

---

## 🛠️ Architecture & Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | HTML5, Vanilla CSS, JS | Modern dark mode theme with dynamic palettes & glassmorphism |
| **Network Graphs** | `vis-network` | Interactive character relationship visualizer |
| **Database** | LibSQL / Turso | SQLite-compatible cloud database for instant multi-device sync |
| **Storage** | Cloudflare R2 | S3-compatible cloud object storage for covers and attachments |
| **Auth** | Clerk | Hosted OAuth and email-based authentication |
| **Desktop App** | Electron | Desktop runtime |
| **Mobile App** | Expo (React Native) | Cross-platform iOS and Android mobile app |

---

## 📁 Repository Structure

```
reading-library/
├── index.html            # Main web app layout and templates
├── style.css             # Design system, CSS tokens, and component styles
├── app.js                # Core web app logic, UI interactions, and state
├── main.js               # Electron main process and IPC handlers
├── preload.js            # Secure Electron bridge
├── data-layer/           # Shared database queries & client factory
│   ├── index.js          # Platform-agnostic libSQL query handlers
│   └── client.js         # LibSQL client factory (embedded replica vs HTTP)
├── storage/              # R2 storage driver for desktop/web
│   └── r2.js             # AWS S3 SDK integration for Cloudflare R2
├── auth/                 # Clerk auth integration and verification
│   └── Clerkauth.js      # Clerk session verification & deep-linking
└── mobile/               # Expo SDK 54 mobile application
    ├── src/              # Expo Router pages, components, and hooks
    └── metro.config.js   # Metro bundler isolation rules
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher

### Environment Setup

Create a `.env` file in the root directory:

```env
TURSO_DATABASE_URL=libsql://your-database-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_r2_bucket_name
```

---

## 🖥️ Running the Web / Desktop Application

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the Desktop Application**:
   ```bash
   npm start
   ```

---

## 📱 Running the Mobile Companion App

1. **Navigate to the `mobile` directory**:
   ```bash
   cd mobile
   ```

2. **Install mobile dependencies**:
   ```bash
   npm install
   ```

3. **Start the Expo server**:
   ```bash
   npx expo start -c
   ```

4. **Open on device**:
   - Scan the terminal QR code using **Expo Go** (Android) or the **Camera App** (iOS).

---

## 📜 License

ISC License.
