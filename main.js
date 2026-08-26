const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// Load env vars from the packaged resources dir when running as a built
// exe (friends running the installer never set up their own .env), or
// from the repo root in dev.
require('dotenv').config({
  path: app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '.env'),
});

const { createDesktopClient } = require('./data-layer/client');
const dataLayer = require('./data-layer');
const { ensureUsersTable, signUp, signIn, userExists } = require('./auth/localAuth.js');
const { createR2Client, makeKey, uploadBuffer, deleteObject, downloadBuffer } = require('./storage/r2');
const { getOrDownload, evictIfOverLimit } = require('./storage/cache');

let mainWindow;
let db;                 // libSQL client (Turso embedded replica)
let s3;                 // R2 client
let currentUser = null; // { id, username } — set after successful local sign-in/sign-up

const getImagesPath = () => path.join(app.getPath('userData'), 'images'); // legacy local images — see note in files:getImageData
const getAttachmentsPath = () => path.join(app.getPath('userData'), 'attachments'); // legacy local attachments
const getCacheDir = () => path.join(app.getPath('userData'), 'asset-cache'); // downloaded-from-R2 cache
const getDbPath = () => path.join(app.getPath('userData'), 'library.db');
const getSessionPath = () => path.join(app.getPath('userData'), 'session.enc');

function ensureDirectories() {
  const dir = getImagesPath();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const attachDir = getAttachmentsPath();
  if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });
  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
}

async function ensureDefaultLibrary(ownerId) {
  const existing = await dataLayer.libraries.getAll(db, ownerId);
  if (existing.length === 0) {
    await dataLayer.libraries.create(db, ownerId, { name: 'My Library', icon: 'grid', icon_image: null });
  }
}

// ─── Session persistence (encrypted at rest via OS keychain) ─────────────
// We persist the user object itself, not a token — there's no external
// provider to check back in with, so a saved session is just "did this
// user id still exist in the DB last we checked" (re-verified at launch
// via userExists()).

function saveSession(user) {
  if (!safeStorage.isEncryptionAvailable()) return; // falls back to re-login every launch
  fs.writeFileSync(getSessionPath(), safeStorage.encryptString(JSON.stringify(user)));
}
function loadSession() {
  if (!fs.existsSync(getSessionPath()) || !safeStorage.isEncryptionAvailable()) return null;
  try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(getSessionPath()))); } catch { return null; }
}
function clearSession() {
  if (fs.existsSync(getSessionPath())) fs.unlinkSync(getSessionPath());
}

// Single-instance lock just focuses the existing window on relaunch — no
// custom protocol handler needed now that sign-in is a form, not a
// browser round-trip.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Auth flow ────────────────────────────────────────────────────────────

ipcMain.handle('auth:signUp', async (_, username, password) => {
  try {
    const user = await signUp(db, username, password);
    currentUser = user;
    saveSession(user);
    await ensureDefaultLibrary(user.id);
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('auth:signIn', async (_, username, password) => {
  try {
    const user = await signIn(db, username, password);
    currentUser = user;
    saveSession(user);
    await ensureDefaultLibrary(user.id);
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('auth:signOut', () => {
  clearSession();
  currentUser = null;
});
ipcMain.handle('auth:currentUser', () => currentUser);

function requireUser() {
  if (!currentUser) throw new Error('Not signed in');
  return currentUser.id;
}

// ─── Window & lifecycle ─────────────────────────────────────────────────

function createWindow(initialTheme) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 650,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--initial-theme=${initialTheme}`],
    },
    backgroundColor: initialTheme === 'light' ? '#F2EFE6' : '#1B1E1A',
    show: false,
    title: 'Myaarchive',
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ensureDirectories();

  db = createDesktopClient({
    localDbPath: getDbPath(),
    syncUrl: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  await ensureUsersTable(db);
  await dataLayer.ensureStatusesTable(db);
  // Book-detail expansion: date started/finished, book type, rating,
  // original language/origin, artist, publishers, licensing status, etc.
  // (series) and per-volume publication date (volumes). Both are additive
  // ALTER TABLE migrations — safe to run on every launch.
  await dataLayer.ensureSeriesExtraColumns(db);
  await dataLayer.ensureVolumesExtraColumns(db);

  s3 = createR2Client({
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  });
  evictIfOverLimit(getCacheDir());

  // Restore a previous session so sign-in isn't required every launch.
  // Just re-checks that the saved user id still exists in the DB — no
  // external provider to reach out to.
  const savedSession = loadSession();
  if (savedSession && await userExists(db, savedSession.id)) {
    currentUser = savedSession;
  } else if (savedSession) {
    clearSession(); // user was deleted/DB reset — will re-prompt via auth gate
  }

  const initialTheme = currentUser
    ? ((await dataLayer.settings.getAll(db, currentUser.id)).theme === 'light' ? 'light' : 'dark')
    : 'dark';
  nativeTheme.themeSource = initialTheme;
  createWindow(initialTheme);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(initialTheme); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Window Controls ───────────────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// ─── IPC: Libraries ──────────────────────────────────────────────────────
ipcMain.handle('libraries:getAll', () => dataLayer.libraries.getAll(db, requireUser()));
ipcMain.handle('libraries:create', (_, d) => dataLayer.libraries.create(db, requireUser(), d));
ipcMain.handle('libraries:update', (_, id, d) => dataLayer.libraries.update(db, id, d));
ipcMain.handle('libraries:delete', (_, id) => dataLayer.libraries.delete(db, id));

// ─── IPC: Tags / Genres ───────────────────────────────────────────────────
ipcMain.handle('tags:getAll', () => dataLayer.tags.getAll(db));
ipcMain.handle('tags:create', (_, name) => dataLayer.tags.create(db, name));
ipcMain.handle('genres:getAll', () => dataLayer.genres.getAll(db));

// ─── IPC: Statuses (customizable) ──────────────────────────────────────────
ipcMain.handle('statuses:getAll', () => dataLayer.statuses.getAll(db));
ipcMain.handle('statuses:create', (_, d) => dataLayer.statuses.create(db, d));
ipcMain.handle('statuses:update', (_, id, d) => dataLayer.statuses.update(db, id, d));
ipcMain.handle('statuses:delete', (_, id) => dataLayer.statuses.delete(db, id));

// ─── IPC: Settings ────────────────────────────────────────────────────────
ipcMain.handle('settings:getAll', () => dataLayer.settings.getAll(db, requireUser()));
ipcMain.handle('settings:set', async (_, key, value) => {
  const r = await dataLayer.settings.set(db, requireUser(), key, value);
  if (key === 'theme') nativeTheme.themeSource = value === 'light' ? 'light' : 'dark';
  return r;
});

// ─── IPC: Series ──────────────────────────────────────────────────────────
ipcMain.handle('series:getAll', (_, filters) => dataLayer.series.getAll(db, requireUser(), filters));
ipcMain.handle('series:get', (_, id) => dataLayer.series.get(db, requireUser(), id));
ipcMain.handle('series:create', (_, d) => dataLayer.series.create(db, requireUser(), d));
ipcMain.handle('series:update', (_, id, d) => dataLayer.series.update(db, requireUser(), id, d));
ipcMain.handle('series:delete', (_, id) => dataLayer.series.delete(db, requireUser(), id));

// ─── IPC: Volumes ─────────────────────────────────────────────────────────
ipcMain.handle('volumes:getBySeries', (_, sid) => dataLayer.volumes.getBySeries(db, sid));
ipcMain.handle('volumes:get', (_, id) => dataLayer.volumes.get(db, id));
ipcMain.handle('volumes:create', (_, d) => dataLayer.volumes.create(db, d));
ipcMain.handle('volumes:update', (_, id, d) => dataLayer.volumes.update(db, id, d));
ipcMain.handle('volumes:delete', (_, id) => dataLayer.volumes.delete(db, id));

// ─── IPC: Characters ──────────────────────────────────────────────────────
ipcMain.handle('characters:getBySeries', (_, sid) => dataLayer.characters.getBySeries(db, sid));
ipcMain.handle('characters:get', (_, id) => dataLayer.characters.get(db, id));
ipcMain.handle('characters:create', (_, d) => dataLayer.characters.create(db, d));
ipcMain.handle('characters:update', (_, id, d) => dataLayer.characters.update(db, id, d));
ipcMain.handle('characters:delete', (_, id) => dataLayer.characters.delete(db, id));

// ─── IPC: Relationships ────────────────────────────────────────────────────
ipcMain.handle('relationships:getBySeries', (_, sid) => dataLayer.relationships.getBySeries(db, sid));
ipcMain.handle('relationships:getByCharacter', (_, cid) => dataLayer.relationships.getByCharacter(db, cid));
ipcMain.handle('relationships:create', (_, d) => dataLayer.relationships.create(db, d));
ipcMain.handle('relationships:update', (_, id, d) => dataLayer.relationships.update(db, id, d));
ipcMain.handle('relationships:delete', (_, id) => dataLayer.relationships.delete(db, id));

// ─── IPC: Gallery (still local disk — R2 is a separate future step) ───────
ipcMain.handle('gallery:getBySeries', (_, sid) => dataLayer.gallery.getBySeries(db, sid));
ipcMain.handle('gallery:add', (_, d) => dataLayer.gallery.add(db, d));
ipcMain.handle('gallery:updateCaption', (_, id, caption) => dataLayer.gallery.updateCaption(db, id, caption));
ipcMain.handle('gallery:delete', async (_, id) => {
  const row = await dataLayer.gallery.delete(db, id);
  if (row?.image_path) await deleteObject(s3, process.env.R2_BUCKET_NAME, row.image_path);
  return true;
});
ipcMain.handle('gallery:reorder', (_, orderedIds) => dataLayer.gallery.reorder(db, orderedIds));

// ─── IPC: Attachments — now R2-backed ──────────────────────────────────────
ipcMain.handle('attachments:getBySeries', (_, sid) => dataLayer.attachments.getBySeries(db, sid));
ipcMain.handle('attachments:openDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle('attachments:add', async (_, seriesId, sourcePath) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const originalName = path.basename(sourcePath);
  const buffer = fs.readFileSync(sourcePath);
  const key = makeKey(`attachments/${seriesId}`, sourcePath);
  await uploadBuffer(s3, process.env.R2_BUCKET_NAME, key, buffer, 'application/octet-stream');
  return dataLayer.attachments.add(db, { series_id: seriesId, file_path: key, file_name: originalName, file_size: buffer.length });
});
// Opening a file in the OS default app needs a real local path — R2 keys
// aren't directly openable — so this downloads through the same cache used
// for images (or serves instantly from cache if already downloaded once).
// Backward-compat: attachments added before this step have a real local
// path stored, not an R2 key — open those directly instead.
ipcMain.handle('attachments:open', async (_, key) => {
  if (fs.existsSync(key)) {
    const result = await shell.openPath(key);
    return result === '';
  }
  const filePath = await getOrDownload(getCacheDir(), key, (k) => downloadBuffer(s3, process.env.R2_BUCKET_NAME, k));
  if (!filePath) return false;
  const result = await shell.openPath(filePath);
  return result === '';
});
ipcMain.handle('attachments:delete', async (_, id) => {
  const row = await dataLayer.attachments.delete(db, id);
  if (row?.file_path) await deleteObject(s3, process.env.R2_BUCKET_NAME, row.file_path);
  return true;
});

// ─── IPC: Images (covers, portraits, nav icons, gallery) — now R2-backed ───
// `category` becomes the R2 key prefix (e.g. 'covers', 'char', 'gallery',
// 'navicon') — matches the naming convention documented in storage/r2.js.
ipcMain.handle('files:openImageDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('files:openImagesDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle('files:saveImage', async (_, sourcePath, category) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const buffer = fs.readFileSync(sourcePath);
  const key = makeKey(category, sourcePath);
  const ext = path.extname(sourcePath).slice(1).toLowerCase();
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'application/octet-stream';
  await uploadBuffer(s3, process.env.R2_BUCKET_NAME, key, buffer, mime);
  return key; // stored directly in DB columns like cover_image_path
});
// `key` is now an R2 object key, not a local path. Downloads once into the
// local cache (storage/cache.js), then every subsequent read is instant —
// same <img src="data:..."> contract the renderer already expects, so no
// app.js changes were needed for this swap.
ipcMain.handle('files:getImageData', async (_, key) => {
  if (!key) return null;
  // Backward-compat: anything saved by the OLD local-disk version is a real
  // filesystem path (starts with the userData images folder), not an R2
  // key — read it directly instead of trying to "download" a local path
  // from R2, which would just fail. Any covers/portraits/gallery pics you
  // added before this step fall into this branch; re-uploading them will
  // move them onto R2 properly, but nothing breaks in the meantime.
  if (fs.existsSync(key)) {
    try {
      const ext = path.extname(key).slice(1).toLowerCase();
      const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg';
      return `data:${mime};base64,${fs.readFileSync(key).toString('base64')}`;
    } catch { return null; }
  }

  const filePath = await getOrDownload(getCacheDir(), key, (k) => downloadBuffer(s3, process.env.R2_BUCKET_NAME, k));
  if (!filePath) return null;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
});

// ─── IPC: Export ──────────────────────────────────────────────────────────
ipcMain.handle('export:json', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `bookshelf-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;

  const ownerId = requireUser();
  const libraries = await dataLayer.libraries.getAll(db, ownerId);
  const series = await dataLayer.series.getAll(db, ownerId, {});

  const volumes = [], characters = [], relationships = [], galleryImages = [], attachments = [];
  for (const s of series) {
    volumes.push(...await dataLayer.volumes.getBySeries(db, s.id));
    characters.push(...await dataLayer.characters.getBySeries(db, s.id));
    relationships.push(...await dataLayer.relationships.getBySeries(db, s.id));
    galleryImages.push(...await dataLayer.gallery.getBySeries(db, s.id));
    attachments.push(...await dataLayer.attachments.getBySeries(db, s.id));
  }

  const data = { exportedAt: new Date().toISOString(), version: 2, libraries, series, volumes, characters, relationships, gallery_images: galleryImages, attachments };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return true;
});

ipcMain.handle('export:pdf', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `reading-log-${new Date().toISOString().slice(0, 10)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return false;
  try {
    const pdf = await mainWindow.webContents.printToPDF({ printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
    fs.writeFileSync(filePath, pdf);
    return true;
  } catch (e) { console.error(e); return false; }
});
