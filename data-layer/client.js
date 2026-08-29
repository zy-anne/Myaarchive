// ─── libSQL Client Factory ──────────────────────────────────────────────────
//
// This is the ONLY file that differs between the desktop (Electron) build
// and the future mobile (Expo) build. Everything in data-layer/index.js is
// written against the plain @libsql/client interface (execute/batch), so it
// runs unmodified on either platform once it's handed a client from here.
//
// Desktop: embedded replica. A local libSQL file lives in userData and syncs
// with the remote Turso primary in the background (`syncInterval`) and on
// demand (`client.sync()`). Reads are served from the local file — instant,
// works offline — while writes go through libSQL's replication to the
// remote primary. This is what gives us "fast + offline-capable" for free
// instead of hand-rolling a sync queue.
//
// Mobile (Expo): no embedded replica support today, so it should call
// createRemoteClient() instead, which talks to the Turso HTTP endpoint
// directly. Every write is a network round-trip on mobile until/unless
// Turso ships replica support for React Native — tracked as a Phase 5 risk,
// not something to solve now.
//
// ─── Resilience ───────────────────────────────────────────────────────────
// Recovery from local-replica corruption is orchestrated by main.js
// (bootstrapSchema / withDbRecovery / rebuildLocalReplica), not by this
// file — main.js needs to close the connection, delete the local replica
// files, open a fresh one, and retry the specific operation that failed,
// which only the caller can do safely. This file's job is just to build
// clients and expose the low-level file-deletion helper main.js needs for
// that recovery.

const fs = require('fs');

// Deletes the local embedded-replica file and its SQLite sidecar files
// (WAL, shared-memory, journal) so the next createDesktopClient() call
// re-clones a fresh copy from the remote Turso primary instead of reusing
// a corrupted or schema-drifted local file.
function removeLocalReplicaFiles(localDbPath) {
    const suffixes = ['', '-wal', '-shm', '-client_wal_index', '-journal'];
    for (const suffix of suffixes) {
        try { fs.rmSync(`${localDbPath}${suffix}`, { force: true }); } catch { /* fine if it never existed */ }
    }
}

function createDesktopClient({ localDbPath, syncUrl, authToken }) {
    const { createClient } = require('@libsql/client');
    return createClient({
        url: `file:${localDbPath}`,
        syncUrl,
        authToken,
        syncInterval: 30, // seconds; also call client.sync() after local writes for freshness
    });
}

/**
 * Remote-only client (mobile, or any environment without local file access).
 */
function createRemoteClient({ url, authToken }) {
    const { createClient } = require('@libsql/client/http');
    return createClient({ url, authToken });
}

module.exports = {
    createDesktopClient,
    createRemoteClient,
    removeLocalReplicaFiles // <-- Export this function
};