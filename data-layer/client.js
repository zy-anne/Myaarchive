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

function createDesktopClient({ localDbPath, syncUrl, authToken, deferSync = false }) {
    const { createClient } = require('@libsql/client');
    
    // Create client with sync enabled from the start
    const client = createClient({
        url: `file:${localDbPath}`,
        syncUrl,
        authToken,
        syncInterval: 30,
    });
    
    // Wrap execute to handle WalConflict with retry logic
    const originalExecute = client.execute.bind(client);
    client.execute = async function(query) {
        const maxRetries = 10;
        let lastError;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await originalExecute(query);
            } catch (error) {
                lastError = error;
                
                // Handle WalConflict errors with exponential backoff
                if (error.message?.includes('WalConflict')) {
                    const delay = Math.min(50 * Math.pow(2, attempt), 3000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                // Retry on sync conflicts too
                if (error.message?.includes('SQLITE_BUSY') || error.message?.includes('database is locked')) {
                    const delay = Math.min(50 * Math.pow(2, attempt), 3000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                // Don't retry other errors
                throw error;
            }
        }
        throw lastError;
    };
    
    return client;
}

/**
 * Remote-only client (mobile, or any environment without local file access).
 */
function createRemoteClient({ url, authToken }) {
    const { createClient } = require('@libsql/client/http');
    return createClient({ url, authToken });
}

module.exports = { createDesktopClient, createRemoteClient };