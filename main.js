const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu, shell, safeStorage, session, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const envCandidates = [
  path.join(app.getPath('userData'), '.env'),
  app.isPackaged ? path.join(process.resourcesPath, '.env') : path.join(__dirname, '.env'),
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) { require('dotenv').config({ path: p, quiet: true }); break; }
}

const { createDesktopClient, removeLocalReplicaFiles } = require('./data-layer/client');
const dataLayer = require('./data-layer');
const { ensureUsersTable, signUp, signIn, userExists, verifyPassword, changePassword, ensureSecurityQuestionColumns, getSecurityQuestion, resetPasswordWithSecurityAnswer, getOwnSecurityQuestion, setSecurityQuestion } = require('./auth/localAuth.js');
const { createR2Client, makeKey, uploadBuffer, deleteObject, downloadBuffer } = require('./storage/r2');
const { getOrDownload, evictIfOverLimit } = require('./storage/cache');
const { httpUrl: validateHttpUrl } = require('./data-layer/validate');

let mainWindow;
let db;                 // libSQL client (Turso embedded replica)
let s3;                 // R2 client
let currentUser = null; // { id, username } — set after successful local sign-in/sign-up

// Covers, portraits, nav icons, and gallery images all go through
// files:saveImage below, regardless of category — capping size here keeps
// a mis-click (e.g. picking a multi-megapixel camera-original photo) from
// ballooning the shared R2 bucket. Checked via fs.statSync BEFORE
// fs.readFileSync, so an oversized file is rejected without ever being
// read into memory. Keep this in sync with the "max 10MB" copy in
// index.html's cover/portrait/icon picker labels if it ever changes.
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
// File attachments (PDFs, notes, ebooks, etc. — see attachments:add below)
// are a separate, larger cap since a legitimate scanned PDF can run tens
// of MB, but this still stops something like a video or disk image from
// silently landing in the shared R2 bucket. Keep in sync with the "max
// 100MB" hint under the Files tab's "+ Add File" button in index.html.
const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;
const formatMB = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

const ALLOWED_IMAGE_CATEGORIES = new Set(['series', 'vol', 'char', 'gallery', 'navicon']);
const IMAGE_KEY_RE = /^(series|vol|char|gallery|navicon)\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/i;
const ATTACH_KEY_RE = /^attachments\/\d+\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/i;
const RISKY_OPEN_EXTS = new Set(['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.vbs', '.js', '.jse',
  '.wsf', '.lnk', '.jar', '.reg', '.hta', '.dll', '.cpl']);
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

function sniffImageMime(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
function isInside(root, target) {
  const r = path.resolve(root) + path.sep;
  return path.resolve(target).startsWith(r);
}

const imageDataUrlCache = new Map();
const IMAGE_DATA_URL_CACHE_MAX = 60;

function getCachedImageDataUrl(key) {
  const cached = imageDataUrlCache.get(key);
  if (cached !== undefined) {
    imageDataUrlCache.delete(key);
    imageDataUrlCache.set(key, cached);
  }
  return cached;
}

function setCachedImageDataUrl(key, dataUrl) {
  imageDataUrlCache.delete(key);
  imageDataUrlCache.set(key, dataUrl);
  if (imageDataUrlCache.size > IMAGE_DATA_URL_CACHE_MAX) {
    const oldest = imageDataUrlCache.keys().next().value;
    imageDataUrlCache.delete(oldest);
  }
}

const getImagesPath = () => path.join(app.getPath('userData'), 'images');
const getAttachmentsPath = () => path.join(app.getPath('userData'), 'attachments');
const getCacheDir = () => path.join(app.getPath('userData'), 'asset-cache');
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

// ─── Database setup & self-healing recovery ────────────────────────────
// This app points every instance at ONE shared remote Turso database (see
// data-layer/client.js). The desktop client keeps a local file that
// mirrors that remote database, plus the native driver's own in-process
// schema cache on top of it. If that local file/cache ever ends up out of
// sync with reality — most commonly from schema changes racing across
// multiple instances in the past — queries can fail with errors that
// don't make sense given the query being run (e.g. "no such table"
// naming a table the query never mentioned). There's no reliable way to
// repair that from inside the same connection, so the recovery here
// discards the local replica file and re-clones it fresh from the remote
// primary, then retries.

async function bootstrapSchema() {
  await ensureUsersTable(db);
  await ensureSecurityQuestionColumns(db);
  await dataLayer.ensureTagsTableIsHealthy(db);
  // Tags and statuses need migration logic (upgrading an old global table
  // shape to the current per-user one), so they're bootstrapped
  // separately, before the rest of the schema, and before any
  // tags/statuses queries can run.
  await dataLayer.ensureTagsTable(db);
  await dataLayer.ensureTagColorsBackfilled(db);
  await dataLayer.ensureStatusesTable(db);
  // Everything else (libraries, app_settings, genres, series, volumes,
  // characters, relationships, gallery_images, attachments) — created if
  // missing, so a brand-new Turso database (a friend's first run) works
  // out of the box.
  await dataLayer.ensureCoreSchema(db);
  await dataLayer.ensureIndexes(db);
  // Book-detail expansion: date started/finished, book type, rating,
  // original language/origin, artist, publishers, licensing status, etc.
  // (series) and per-volume publication date (volumes). Both are additive
  // ALTER TABLE migrations — safe to run on every launch.
  await dataLayer.ensureSeriesExtraColumns(db);
  await dataLayer.ensureSeriesCreatedAtColumn(db);
  await dataLayer.ensureVolumesExtraColumns(db);
  await dataLayer.ensureCharacterExtraColumns(db);
}

function isLocalReplicaCorruptionError(err) {
  const msg = String((err && err.message) || err || '');
  return (
    /no such table:\s*main\.\w+_old\b/i.test(msg) ||
    /database disk image is malformed/i.test(msg) ||
    /TRANSACTION_CLOSED/i.test(msg) ||
    /database schema has changed/i.test(msg) ||
    // Embedded-replica WAL frame conflict — the local library.db drifted
    // out of sync with the remote Turso primary (e.g. a write landed
    // between this replica's last sync and its own local write attempt).
    // Same fix as every other case here: discard the local file and
    // re-clone fresh, then retry the operation that failed.
    /WalConflict/i.test(msg)
  );
}
function newDesktopClient() {
  return createDesktopClient({
    localDbPath: getDbPath(),
    syncUrl: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

// Discards the local replica file and opens a fresh client against it —
// libSQL re-clones the whole thing from the remote primary from scratch.
async function rebuildLocalReplica() {
  console.warn('[main] Rebuilding local database replica from remote primary…');
  try { if (db && typeof db.close === 'function') db.close(); } catch { /* best effort */ }

  // Call the properly exported function
  removeLocalReplicaFiles(getDbPath());

  db = newDesktopClient();
  try { if (typeof db.sync === 'function') await db.sync(); } catch { /* will retry lazily on first query */ }
}

async function setupDatabase() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    dialog.showErrorBox(
      'Configuration Missing',
      'TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN are not set. Check that a .env file exists next to package.json (dev) or in the app\'s resources folder (packaged build) with both values filled in.'
    );
    app.quit();
    return;
  }
  if (!/^(libsql|https|wss):\/\//i.test(process.env.TURSO_DATABASE_URL)) {
    dialog.showErrorBox('Insecure Configuration', 'TURSO_DATABASE_URL must use libsql://, https:// or wss://.');
    app.quit();
    return;
  }
  db = newDesktopClient();
  try {
    await bootstrapSchema();
  } catch (err) {
    console.error('[main] Schema bootstrap failed:', err);
    if (isLocalReplicaCorruptionError(err)) {
      await rebuildLocalReplica();
      await bootstrapSchema(); // let a second failure surface for real
      return;
    }
    // DNS/network failures (ENOTFOUND, EAI_AGAIN, or the raw
    // "No such host is known" text libsql surfaces on Windows) aren't
    // recoverable by rebuilding the local replica — that just re-tries
    // the same unreachable host. Show a clear message instead of letting
    // this bubble up as an unhandled rejection that kills the process
    // silently from the person's point of view.
    const msg = String(err?.message || err || '');
    if (/dns error|ENOTFOUND|EAI_AGAIN|No such host/i.test(msg)) {
      dialog.showErrorBox(
        'Can\'t Reach the Database',
        'Myaarchive couldn\'t connect to the Turso database. Check your internet connection and that TURSO_DATABASE_URL in .env is correct, then restart the app.'
      );
      app.quit();
      return;
    }
    throw err;
  }
}

// Wraps a DB-touching operation: if it fails in a way that looks like
// local embedded-replica corruption, transparently rebuilds the local
// replica from the remote primary and retries once, rather than
// surfacing a confusing low-level error for something that isn't really
// the person's data going wrong.
async function withDbRecovery(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!isLocalReplicaCorruptionError(err)) throw err;
    console.warn('[main] Detected local database replica corruption, recovering:', err.message || err);
    await rebuildLocalReplica();
    return await fn();
  }
}

function assertTrustedSender(event) {
  const url = event.senderFrame?.url || '';
  if (!url.startsWith('file://')) throw new Error('Untrusted sender');
}

// Thin wrapper around ipcMain.handle that routes the handler body through
// withDbRecovery. Used for every handler that (directly or via dataLayer)
// touches `db`.
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return withDbRecovery(() => fn(event, ...args));
  });
}

// ─── Session persistence (encrypted at rest via OS keychain) ─────────────
// We persist the user object itself, not a token — there's no external
// provider to check back in with, so a saved session is just "did this
// user id still exist in the DB last we checked" (re-verified at launch
// via userExists()).

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function saveSession(user) {
  if (!safeStorage.isEncryptionAvailable()) return; // falls back to re-login every launch
  fs.writeFileSync(getSessionPath(), safeStorage.encryptString(JSON.stringify({ ...user, savedAt: Date.now() })));
}
function loadSession() {
  if (!fs.existsSync(getSessionPath()) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const s = JSON.parse(safeStorage.decryptString(fs.readFileSync(getSessionPath())));
    if (!s.savedAt || Date.now() - s.savedAt > SESSION_MAX_AGE_MS) return null;
    return { id: s.id, username: s.username };
  } catch { return null; }
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

// ─── Auth throttling (in-memory; resets on restart) ────────────────────
const authFailures = new Map();
const throttleKey = (kind, id) => `${kind}:${String(id || '').trim().toLowerCase()}`;

function checkThrottle(key) {
  const rec = authFailures.get(key);
  if (rec && rec.lockedUntil > Date.now()) {
    throw new Error(`Too many attempts. Try again in ${Math.ceil((rec.lockedUntil - Date.now()) / 1000)}s.`);
  }
}
function recordFailure(key) {
  if (authFailures.size > 5000) authFailures.clear();
  const rec = authFailures.get(key) || { count: 0, lockedUntil: 0 };
  rec.count++;
  if (rec.count >= 5) rec.lockedUntil = Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** (rec.count - 5));
  authFailures.set(key, rec);
}
const clearFailures = (key) => authFailures.delete(key);

// ─── Auth flow ────────────────────────────────────────────────────────────
// One shared Turso database + one shared R2 bucket for every account (the
// admin — you — owns both, baked into the packaged app's .env). Isolation
// between accounts is enforced entirely by owner_id scoping in the data
// layer, not by separate infrastructure per person.

handle('auth:signUp', async (_, username, password, securityQuestion, securityAnswer) => {
  try {
    const user = await signUp(db, username, password, securityQuestion, securityAnswer);
    currentUser = user;
    saveSession(user);
    await ensureDefaultLibrary(user.id);
    await dataLayer.ensureDefaultStatusesForUser(db, user.id);
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
handle('auth:signIn', async (_, username, password) => {
  const key = throttleKey('signin', username);
  try {
    checkThrottle(key);
    const user = await signIn(db, username, password);
    clearFailures(key);
    currentUser = user;
    saveSession(user);
    await ensureDefaultLibrary(user.id);
    await dataLayer.ensureDefaultStatusesForUser(db, user.id);
    return { ok: true, user };
  } catch (e) {
    if (/Invalid username or password/.test(e.message)) recordFailure(key);
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('auth:signOut', (event) => {
  assertTrustedSender(event);
  clearSession();
  imageDataUrlCache.clear();
  currentUser = null;
});
ipcMain.handle('auth:currentUser', (event) => {
  assertTrustedSender(event);
  return currentUser;
});

// ─── Password Recovery (public — no sign-in required) ───────────────────
handle('auth:getSecurityQuestion', async (_, username) => {
  try {
    const question = await getSecurityQuestion(db, username);
    return { ok: true, question };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
handle('auth:resetPassword', async (_, username, answer, newPassword) => {
  const key = throttleKey('reset', username);
  try {
    checkThrottle(key);
    await resetPasswordWithSecurityAnswer(db, username, answer, newPassword);
    clearFailures(key);
    return { ok: true };
  } catch (e) {
    if (/incorrect/i.test(e.message)) recordFailure(key);
    return { ok: false, error: e.message };
  }
});

function requireUser() {
  if (!currentUser) throw new Error('Not signed in');
  return currentUser.id;
}

const owned = {
  series: (id) => dataLayer.guards.series(db, requireUser(), id),
  child: (table, id) => dataLayer.guards.child(db, requireUser(), table, id),
  relationship: (id) => dataLayer.guards.relationship(db, requireUser(), id),
};
async function deleteUnreferencedKeys(keys) {
  for (const k of keys) {
    try { if (!(await dataLayer.isKeyReferenced(db, k))) await deleteObject(s3, process.env.R2_BUCKET_NAME, k); } catch { /* orphan is non-fatal */ }
  }
}

// ─── IPC: Account (Change Password & Danger Zone) ───────────────────────
// Change Password is the only supported way to update a password
// post sign-up — previously there was no path short of editing the users
// table directly. Re-verifies the current password even though the
// person is already signed in, same rationale as account:delete below.
handle('account:changePassword', async (_, currentPassword, newPassword) => {
  const userId = requireUser();
  const key = throttleKey('pw', userId);
  try {
    checkThrottle(key);
    await changePassword(db, userId, currentPassword, newPassword);
    clearFailures(key);
    return { ok: true };
  } catch (e) {
    if (/incorrect/i.test(e.message)) recordFailure(key);
    return { ok: false, error: e.message };
  }
});

handle('account:getSecurityQuestion', async () => {
  const userId = requireUser();
  const question = await getOwnSecurityQuestion(db, userId);
  return { question };
});
handle('account:setSecurityQuestion', async (_, currentPassword, question, answer) => {
  const userId = requireUser();
  const key = throttleKey('pw', userId);
  try {
    checkThrottle(key);
    await setSecurityQuestion(db, userId, currentPassword, question, answer);
    clearFailures(key);
    return { ok: true };
  } catch (e) {
    if (/incorrect/i.test(e.message)) recordFailure(key);
    return { ok: false, error: e.message };
  }
});

// Permanently deletes the signed-in account and every row it owns. Gated
// behind a fresh password check (see auth/localAuth.js#verifyPassword)
// even though the person is already signed in — the confirmation typed in
// the renderer (their username) is a "you meant to click this" guard, the
// password is the actual authorization check.
handle('account:delete', async (_, password) => {
  const userId = requireUser();
  const key = throttleKey('pw', userId);
  try {
    checkThrottle(key);
    const ok = await verifyPassword(db, userId, password);
    if (!ok) {
      recordFailure(key);
      return { ok: false, error: 'Incorrect password' };
    }
    clearFailures(key);

    const { r2Keys } = await dataLayer.account.delete(db, userId);

    // Best-effort R2 cleanup — the DB side is already fully committed at
    // this point, so a failure here just leaves orphaned objects in the
    // shared bucket rather than an inconsistent account.
    for (const k of r2Keys) {
      try { await deleteObject(s3, process.env.R2_BUCKET_NAME, k); } catch { /* orphaned object — non-fatal */ }
    }

    clearSession();
    currentUser = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─── Window & lifecycle ─────────────────────────────────────────────────

function createWindow(initialTheme, initialColorTheme) {
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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: [`--initial-theme=${initialTheme}`, `--initial-color-theme=${initialColorTheme}`],
    },
    backgroundColor: initialTheme === 'light' ? '#F2EFE6' : '#1B1E1A',
    show: false,
    title: 'Myaarchive',
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  // Child windows inherit webPreferences (including the preload!), so a
  // user-attached link opened via window.open() must never become an
  // Electron window with window.api. Send it to the OS browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  Menu.setApplicationMenu(null);
  ensureDirectories();

  await setupDatabase();

  s3 = createR2Client({
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    jurisdiction: process.env.R2_JURISDICTION,
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

  const initialSettings = currentUser ? await dataLayer.settings.getAll(db, currentUser.id) : {};
  const initialTheme = initialSettings.theme === 'light' ? 'light' : 'dark';
  const initialColorTheme = initialSettings.colorTheme || 'default';
  nativeTheme.themeSource = initialTheme;
  createWindow(initialTheme, initialColorTheme);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(initialTheme, initialColorTheme); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Window Controls ───────────────────────────────────────────────────
ipcMain.handle('window:minimize', (event) => {
  assertTrustedSender(event);
  mainWindow?.minimize();
});
ipcMain.handle('window:maximize', (event) => {
  assertTrustedSender(event);
  if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize();
});
ipcMain.handle('window:close', (event) => {
  assertTrustedSender(event);
  mainWindow?.close();
});
ipcMain.handle('window:isMaximized', (event) => {
  assertTrustedSender(event);
  return mainWindow?.isMaximized() ?? false;
});

// ─── IPC: Libraries ──────────────────────────────────────────────────────
handle('libraries:getAll', () => dataLayer.libraries.getAll(db, requireUser()));
handle('libraries:create', (_, d) => dataLayer.libraries.create(db, requireUser(), d));
handle('libraries:update', (_, id, d) => dataLayer.libraries.update(db, requireUser(), id, d));
handle('libraries:delete', async (_, id) => {
  const { r2Keys } = await dataLayer.libraries.delete(db, requireUser(), id);
  await deleteUnreferencedKeys(r2Keys);
  return true;
});
handle('libraries:reorder', (_, orderedIds) => dataLayer.libraries.reorder(db, requireUser(), orderedIds));

// ─── IPC: Tags (per-user) / Genres (shared) / Content Warnings (per-user) ──
handle('tags:getAll', () => dataLayer.tags.getAll(db, requireUser()));
handle('tags:create', (_, name) => dataLayer.tags.create(db, requireUser(), name));
handle('tags:update', (_, id, d) => dataLayer.tags.update(db, requireUser(), id, d));
handle('tags:delete', (_, id) => dataLayer.tags.delete(db, requireUser(), id));
handle('tags:getUsageCounts', () => dataLayer.tags.getUsageCounts(db, requireUser()));
handle('contentWarnings:getAll', () => dataLayer.contentWarnings.getAll(db, requireUser()));
handle('contentWarnings:create', (_, name) => dataLayer.contentWarnings.create(db, requireUser(), name));
handle('genres:getAll', () => dataLayer.genres.getAll(db));

// ─── IPC: Statuses (per-user, customizable) ────────────────────────────────
handle('statuses:getAll', () => dataLayer.statuses.getAll(db, requireUser()));
handle('statuses:create', (_, d) => dataLayer.statuses.create(db, requireUser(), d));
handle('statuses:update', (_, id, d) => dataLayer.statuses.update(db, requireUser(), id, d));
handle('statuses:delete', (_, id) => dataLayer.statuses.delete(db, requireUser(), id));

// ─── IPC: Settings ────────────────────────────────────────────────────────
handle('settings:getAll', () => dataLayer.settings.getAll(db, requireUser()));
const ALLOWED_SETTINGS = new Set(['theme', 'colorTheme', 'autoHideSidebar', 'openDetailAfterAdd', 'showNsfwContent',
  'groupsSectionCollapsed', 'charRelsSectionCollapsed', 'seriesViewMode', 'charViewMode', 'sortField', 'sortDir',
  'defaultStartView', 'lastOpenedLibraryId', 'annualReadingGoal']);

handle('settings:set', async (_, key, value) => {
  if (!ALLOWED_SETTINGS.has(key)) throw new Error('Unknown setting');
  const r = await dataLayer.settings.set(db, requireUser(), key, String(value ?? '').slice(0, 200));
  if (key === 'theme') nativeTheme.themeSource = value === 'light' ? 'light' : 'dark';
  return r;
});

// ─── IPC: Series ──────────────────────────────────────────────────────────
handle('series:getAll', (_, filters) => dataLayer.series.getAll(db, requireUser(), filters));
handle('series:get', (_, id) => dataLayer.series.get(db, requireUser(), id));
handle('series:create', (_, d) => dataLayer.series.create(db, requireUser(), d));
handle('series:update', (_, id, d) => dataLayer.series.update(db, requireUser(), id, d));
handle('series:delete', async (_, id) => {
  const { r2Keys } = await dataLayer.series.delete(db, requireUser(), id);
  await deleteUnreferencedKeys(r2Keys);
  return true;
});
handle('series:transfer', (_, id, targetLibId) => dataLayer.series.transfer(db, requireUser(), id, targetLibId));
handle('series:copy', (_, id, targetLibId, opts) => dataLayer.series.copy(db, requireUser(), id, targetLibId, opts));
handle('series:getBookTypesAndFandoms', () => dataLayer.series.getBookTypesAndFandoms(db, requireUser()));

// ─── IPC: Series Groups (Franchises / Shared Universes) ───────────────────
handle('seriesGroups:getAll', (_, libraryId) => dataLayer.seriesGroups.getAll(db, requireUser(), libraryId));
handle('seriesGroups:get', (_, id) => dataLayer.seriesGroups.get(db, requireUser(), id));
handle('seriesGroups:create', (_, d) => dataLayer.seriesGroups.create(db, requireUser(), d));
handle('seriesGroups:update', (_, id, d) => dataLayer.seriesGroups.update(db, requireUser(), id, d));
handle('seriesGroups:delete', (_, id) => dataLayer.seriesGroups.delete(db, requireUser(), id));

// ─── IPC: Volumes ─────────────────────────────────────────────────────────
handle('volumes:getBySeries', async (_, sid) => { await owned.series(sid); return dataLayer.volumes.getBySeries(db, sid); });
handle('volumes:get', async (_, id) => { await owned.child('volumes', id); return dataLayer.volumes.get(db, id); });
handle('volumes:create', async (_, d) => { await owned.series(d.series_id); return dataLayer.volumes.create(db, d); });
handle('volumes:update', async (_, id, d) => { await owned.child('volumes', id); return dataLayer.volumes.update(db, id, d); });
handle('volumes:delete', async (_, id) => { await owned.child('volumes', id); return dataLayer.volumes.delete(db, id); });
handle('volumes:getReadDatesForOwner', () => dataLayer.volumes.getReadDatesForOwner(db, requireUser()));

// ─── IPC: Characters ──────────────────────────────────────────────────────
handle('characters:getBySeries', async (_, sid) => { await owned.series(sid); return dataLayer.characters.getBySeries(db, sid); });
handle('characters:get', async (_, id) => { await owned.child('characters', id); return dataLayer.characters.get(db, id); });
handle('characters:create', async (_, d) => { await owned.series(d.series_id); return dataLayer.characters.create(db, d); });
handle('characters:update', async (_, id, d) => { await owned.child('characters', id); return dataLayer.characters.update(db, id, d); });
handle('characters:delete', async (_, id) => { await owned.child('characters', id); return dataLayer.characters.delete(db, id); });

// ─── IPC: Relationships ────────────────────────────────────────────────────
handle('relationships:getBySeries', async (_, sid) => { await owned.series(sid); return dataLayer.relationships.getBySeries(db, sid); });
handle('relationships:getByCharacter', async (_, cid) => { await owned.child('characters', cid); return dataLayer.relationships.getByCharacter(db, cid); });
handle('relationships:create', async (_, d) => {
  await owned.child('characters', d.from_character_id);
  await owned.child('characters', d.to_character_id);
  return dataLayer.relationships.create(db, d);
});
handle('relationships:update', async (_, id, d) => {
  await owned.relationship(id);
  await owned.child('characters', d.from_character_id);
  await owned.child('characters', d.to_character_id);
  return dataLayer.relationships.update(db, id, d);
});
handle('relationships:delete', async (_, id) => { await owned.relationship(id); return dataLayer.relationships.delete(db, id); });

// ─── IPC: Gallery ─────────────────────────────────────────────────────────
handle('gallery:getBySeries', async (_, sid) => { await owned.series(sid); return dataLayer.gallery.getBySeries(db, sid); });
handle('gallery:add', async (_, d) => { await owned.series(d.series_id); return dataLayer.gallery.add(db, d); });
handle('gallery:updateCaption', async (_, id, caption) => { await owned.child('gallery_images', id); return dataLayer.gallery.updateCaption(db, id, caption); });
handle('gallery:delete', async (_, id) => {
  await owned.child('gallery_images', id);
  const row = await dataLayer.gallery.delete(db, id);
  if (row?.image_path) await deleteUnreferencedKeys([row.image_path]);
  return true;
});
handle('gallery:reorder', async (_, orderedIds) => {
  for (const id of orderedIds) await owned.child('gallery_images', id);
  return dataLayer.gallery.reorder(db, orderedIds);
});

// ─── IPC: Attachments — now R2-backed ──────────────────────────────────────
handle('attachments:getBySeries', async (_, sid) => { await owned.series(sid); return dataLayer.attachments.getBySeries(db, sid); });
ipcMain.handle('attachments:openDialog', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
  return result.canceled ? [] : result.filePaths;
});
handle('attachments:add', async (_, seriesId, sourcePath) => {
  await owned.series(seriesId);
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const { size } = fs.statSync(sourcePath);
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error(`File is too large (${formatMB(size)}) — max ${formatMB(MAX_ATTACHMENT_SIZE_BYTES)}`);
  }
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
ipcMain.handle('attachments:open', async (event, key) => {
  assertTrustedSender(event);
  requireUser();
  let filePath;
  if (path.isAbsolute(key)) {
    if (!isInside(getAttachmentsPath(), key) || !fs.existsSync(key)) return false;
    filePath = key;
  } else {
    if (!ATTACH_KEY_RE.test(key)) return false;
    filePath = await getOrDownload(getCacheDir(), key, (k) => downloadBuffer(s3, process.env.R2_BUCKET_NAME, k));
    if (!filePath) return false;
  }
  if (RISKY_OPEN_EXTS.has(path.extname(filePath).toLowerCase())) {
    shell.showItemInFolder(filePath); // never auto-launch executables/scripts
    return true;
  }
  return (await shell.openPath(filePath)) === '';
});
handle('attachments:delete', async (_, id) => {
  await owned.child('attachments', id);
  const row = await dataLayer.attachments.delete(db, id);
  if (row?.file_path) await deleteUnreferencedKeys([row.file_path]);
  return true;
});

// ─── IPC: Link Attachments (plain URLs, no storage involved) ──────────────
handle('links:getBySeries', async (_, sid) => { await owned.series(sid); return dataLayer.links.getBySeries(db, sid); });
handle('links:add', async (_, d) => { await owned.series(d.series_id); return dataLayer.links.add(db, { ...d, url: validateHttpUrl(d.url) }); });
handle('links:update', async (_, id, d) => { await owned.child('link_attachments', id); return dataLayer.links.update(db, id, { ...d, url: validateHttpUrl(d.url) }); });
handle('links:delete', async (_, id) => { await owned.child('link_attachments', id); return dataLayer.links.delete(db, id); });

// ─── IPC: Glossary (plain term/definition pairs, no storage involved) ────
handle('glossary:getBySeries', async (_, sid) => { await owned.series(sid); return dataLayer.glossary.getBySeries(db, sid); });
handle('glossary:add', async (_, d) => { await owned.series(d.series_id); return dataLayer.glossary.add(db, d); });
handle('glossary:update', async (_, id, d) => { await owned.child('glossary_terms', id); return dataLayer.glossary.update(db, id, d); });
handle('glossary:delete', async (_, id) => { await owned.child('glossary_terms', id); return dataLayer.glossary.delete(db, id); });

// ─── IPC: Images (covers, portraits, nav icons, gallery) — now R2-backed ───
// `category` becomes the R2 key prefix (e.g. 'covers', 'char', 'gallery',
// 'navicon') — matches the naming convention documented in storage/r2.js.
ipcMain.handle('files:openImageDialog', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('files:openImagesDialog', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle('files:saveImage', async (event, sourcePath, category) => {
  assertTrustedSender(event);
  requireUser();
  if (!ALLOWED_IMAGE_CATEGORIES.has(category)) throw new Error('Invalid image category');
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const { size } = fs.statSync(sourcePath);
  if (size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image is too large (${formatMB(size)}) — max ${formatMB(MAX_IMAGE_SIZE_BYTES)}`);
  }
  const buffer = fs.readFileSync(sourcePath);
  const mime = sniffImageMime(buffer); // trust the bytes, not the filename
  if (!mime) throw new Error('That file is not a valid JPG, PNG, GIF, or WebP image');
  const key = makeKey(category, `x${EXT_BY_MIME[mime]}`);
  await uploadBuffer(s3, process.env.R2_BUCKET_NAME, key, buffer, mime);
  return key;
});

ipcMain.handle('files:getImageData', async (event, key) => {
  assertTrustedSender(event);
  if (!key || typeof key !== 'string') return null;
  requireUser();

  const cached = getCachedImageDataUrl(key);
  if (cached !== undefined) return cached;

  const mimeFor = (p) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[path.extname(p).slice(1).toLowerCase()] || 'image/jpeg');
  let localPath = null;

  if (path.isAbsolute(key)) {
    // Legacy pre-R2 files: only allowed from the app's own folders.
    if (!isInside(getImagesPath(), key) && !isInside(getAttachmentsPath(), key)) return null;
    if (!fs.existsSync(key)) return null;
    localPath = key;
  } else {
    if (!IMAGE_KEY_RE.test(key) && !ATTACH_KEY_RE.test(key)) return null;
    localPath = await getOrDownload(getCacheDir(), key, (k) => downloadBuffer(s3, process.env.R2_BUCKET_NAME, k));
    if (!localPath) return null;
  }
  try {
    const dataUrl = `data:${mimeFor(localPath)};base64,${fs.readFileSync(localPath).toString('base64')}`;
    setCachedImageDataUrl(key, dataUrl);
    return dataUrl;
  } catch { return null; }
});

// ─── IPC: Share Dossier (copy text / save PNG) ───────────────────────────
// Clipboard + save dialog live in the main process: the renderer's
// permission handler denies everything, so navigator.clipboard isn't
// reliable, and a save dialog gives the user control over the location.
ipcMain.handle('share:copyText', (event, text) => {
  assertTrustedSender(event);
  requireUser();
  if (typeof text !== 'string' || text.length === 0 || text.length > 20000) return false;
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('share:saveImage', async (event, dataUrl, suggestedName) => {
  assertTrustedSender(event);
  requireUser();
  const PREFIX = 'data:image/png;base64,';
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) throw new Error('Invalid image data');
  const buf = Buffer.from(dataUrl.slice(PREFIX.length), 'base64');
  if (buf.length === 0 || buf.length > 15 * 1024 * 1024) throw new Error('Image is empty or too large');

  const safeName = path.basename(String(suggestedName || 'dossier.png')).replace(/[^\w.\-]+/g, '_');
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: safeName,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, buf);
  return true;
});

// ─── IPC: Export ──────────────────────────────────────────────────────────
handle('export:json', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `bookshelf-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;

  const ownerId = requireUser();
  const libraries = await dataLayer.libraries.getAll(db, ownerId);
  const seriesList = await dataLayer.series.getAll(db, ownerId, {});
  const series = [];
  for (const s of seriesList) series.push(await dataLayer.series.get(db, ownerId, s.id)); // full rows

  const volumes = [], characters = [], relationships = [], galleryImages = [], attachments = [], links = [], glossary = [];
  for (const s of series) {
    volumes.push(...await dataLayer.volumes.getBySeries(db, s.id));
    characters.push(...await dataLayer.characters.getBySeries(db, s.id));
    relationships.push(...await dataLayer.relationships.getBySeries(db, s.id));
    galleryImages.push(...await dataLayer.gallery.getBySeries(db, s.id));
    attachments.push(...await dataLayer.attachments.getBySeries(db, s.id));
    links.push(...await dataLayer.links.getBySeries(db, s.id));
    glossary.push(...await dataLayer.glossary.getBySeries(db, s.id));
  }
  const seriesGroups = await dataLayer.seriesGroups.getAll(db, ownerId);

  const data = {
    exportedAt: new Date().toISOString(), version: 3, libraries, series, seriesGroups, volumes, characters,
    relationships, gallery_images: galleryImages, attachments, links, glossary
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return true;
});