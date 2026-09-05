// ─── Simple local auth (username + password) ────────────────────────────
// No external service — users live in the same Turso DB as everything
// else. Good enough while there's no personal data involved; if you add
// email or anything sensitive later, swap this for a real auth provider
// or at least move password verification behind a server you control.

const crypto = require('crypto');
const bcrypt = require('bcryptjs'); // pure-JS, no native build step

async function ensureUsersTable(db) {
    await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

async function signUp(db, username, password) {
    username = (username || '').trim();
    if (username.length < 3) throw new Error('Username must be at least 3 characters');
    if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');

    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] });
    if (existing.rows.length > 0) throw new Error('That username is taken');

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    await db.execute({
        sql: 'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
        args: [id, username, hash],
    });
    return { id, username };
}

async function signIn(db, username, password) {
    username = (username || '').trim();
    const row = (await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] })).rows[0];
    if (!row) throw new Error('Invalid username or password');
    const ok = await bcrypt.compare(password || '', row.password_hash);
    if (!ok) throw new Error('Invalid username or password');
    return { id: row.id, username: row.username };
}

async function userExists(db, userId) {
    const row = (await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [userId] })).rows[0];
    return !!row;
}

// Re-verifies a plaintext password against the stored hash for an
// already-known user id (as opposed to signIn, which looks the user up by
// username). Used to gate destructive actions — currently just account
// deletion — behind a fresh password check, even though the person is
// already signed in, so a moment left alone at an unlocked computer can't
// be turned into a silent account wipe.
async function verifyPassword(db, userId, password) {
    const row = (await db.execute({ sql: 'SELECT password_hash FROM users WHERE id = ?', args: [userId] })).rows[0];
    if (!row) return false;
    return bcrypt.compare(password || '', row.password_hash);
}

// The only supported way to change a password post sign-up (previously
// none existed short of editing the users table directly). Requires the
// current password, same "re-verify even though already signed in" gate
// as verifyPassword is used for elsewhere.
async function changePassword(db, userId, currentPassword, newPassword) {
    if (!newPassword || newPassword.length < 4) throw new Error('New password must be at least 4 characters');
    const ok = await verifyPassword(db, userId, currentPassword);
    if (!ok) throw new Error('Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, 10);
    await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [hash, userId] });
    return true;
}

module.exports = { ensureUsersTable, signUp, signIn, userExists, verifyPassword, changePassword };