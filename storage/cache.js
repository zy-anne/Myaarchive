// ─── Local Asset Cache ──────────────────────────────────────────────────
//
// Desktop-only for now (Expo would need its own cache dir under
// FileSystem.cacheDirectory, same idea). Every R2 object key maps to one
// file on disk under userData/asset-cache. On a cache miss we download
// once from R2 and write it; on a hit we just read the local file — no
// network round-trip, no signed-URL churn.
//
// This intentionally does NOT try to be clever about invalidation: image
// files (covers, portraits, gallery pics) are treated as immutable once
// uploaded (a "replace cover" flow uploads a *new* key rather than
// overwriting an old one), so a cached file is never stale. The only
// cleanup needed is basic size-based eviction, below.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function cachePathFor(cacheDir, key) {
    // Hash the key for a flat, filesystem-safe filename; keep the extension
    // so the OS/renderer can still sniff the type if needed.
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const ext = path.extname(key) || '';
    return path.join(cacheDir, `${hash}${ext}`);
}

async function getOrDownload(cacheDir, key, downloadFn) {
    if (!key) return null;
    const filePath = cachePathFor(cacheDir, key);
    if (fs.existsSync(filePath)) return filePath;

    const buffer = await downloadFn(key);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

// Simple total-size cap; deletes oldest-accessed files first. Call this
// periodically (e.g. on app start) rather than on every write, since it
// requires a directory scan.
function evictIfOverLimit(cacheDir, maxBytes = 500 * 1024 * 1024) {
    if (!fs.existsSync(cacheDir)) return;
    const files = fs.readdirSync(cacheDir).map(name => {
        const full = path.join(cacheDir, name);
        const stat = fs.statSync(full);
        return { full, size: stat.size, atime: stat.atime.getTime() };
    });
    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= maxBytes) return;

    files.sort((a, b) => a.atime - b.atime); // oldest-accessed first
    for (const f of files) {
        if (total <= maxBytes) break;
        fs.unlinkSync(f.full);
        total -= f.size;
    }
}

module.exports = { cachePathFor, getOrDownload, evictIfOverLimit };