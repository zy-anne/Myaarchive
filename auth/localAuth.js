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

// Additive migration for password recovery — a security question is
// optional (NULL for anyone who signed up before this existed, or who
// skipped it), so recovery just isn't available for those accounts until
// they set one up via User Settings. The answer is hashed the same way a
// password is; only the question itself is ever shown in plaintext.
async function ensureSecurityQuestionColumns(db) {
    const info = await db.execute(`PRAGMA table_info(users)`);
    const existing = new Set(info.rows.map(r => r.name));
    if (!existing.has('security_question')) {
        await db.execute(`ALTER TABLE users ADD COLUMN security_question TEXT`);
    }
    if (!existing.has('security_answer_hash')) {
        await db.execute(`ALTER TABLE users ADD COLUMN security_answer_hash TEXT`);
    }
}

async function signUp(db, username, password, securityQuestion, securityAnswer) {
    username = (username || '').trim();
    if (username.length < 3) throw new Error('Username must be at least 3 characters');
    if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');

    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] });
    if (existing.rows.length > 0) throw new Error('That username is taken');

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);

    // Optional at sign-up — a blank question/answer just means "set this
    // up later in User Settings" rather than blocking account creation.
    let questionText = null;
    let answerHash = null;
    const trimmedQuestion = (securityQuestion || '').trim();
    const trimmedAnswer = (securityAnswer || '').trim();
    if (trimmedQuestion && trimmedAnswer) {
        questionText = trimmedQuestion;
        answerHash = await bcrypt.hash(trimmedAnswer.toLowerCase(), 10);
    }

    await db.execute({
        sql: 'INSERT INTO users (id, username, password_hash, security_question, security_answer_hash) VALUES (?, ?, ?, ?, ?)',
        args: [id, username, hash, questionText, answerHash],
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

// Public lookup (no auth required — this is the whole point of a recovery
// flow) used by the "Forgot password?" screen to fetch just the question
// text, never the answer hash, for a given username.
async function getSecurityQuestion(db, username) {
    username = (username || '').trim();
    const row = (await db.execute({ sql: 'SELECT security_question FROM users WHERE username = ?', args: [username] })).rows[0];
    if (!row || !row.security_question) return null;
    return row.security_question;
}

// Verifies the answer against the stored hash and, if correct, resets the
// password — the actual recovery step. Case-insensitive on the answer
// (lowercased both at set-time and here) since people are inconsistent
// about capitalizing answers like "Fluffy" vs "fluffy".
async function resetPasswordWithSecurityAnswer(db, username, answer, newPassword) {
    username = (username || '').trim();
    if (!newPassword || newPassword.length < 4) throw new Error('New password must be at least 4 characters');
    const row = (await db.execute({ sql: 'SELECT id, security_answer_hash FROM users WHERE username = ?', args: [username] })).rows[0];
    if (!row || !row.security_answer_hash) throw new Error('No recovery method is set up for this account');
    const ok = await bcrypt.compare((answer || '').trim().toLowerCase(), row.security_answer_hash);
    if (!ok) throw new Error('That answer is incorrect');
    const hash = await bcrypt.hash(newPassword, 10);
    await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [hash, row.id] });
    return true;
}

// For User Settings — shows the signed-in user their own question (so
// they can see whether one is set, and what it currently says) without
// exposing the answer hash.
async function getOwnSecurityQuestion(db, userId) {
    const row = (await db.execute({ sql: 'SELECT security_question FROM users WHERE id = ?', args: [userId] })).rows[0];
    return row?.security_question || null;
}

// Set or update the question/answer from inside User Settings — gated
// behind the current password, same "re-verify even though already
// signed in" rationale as changePassword/verifyPassword above.
async function setSecurityQuestion(db, userId, currentPassword, question, answer) {
    const trimmedQuestion = (question || '').trim();
    const trimmedAnswer = (answer || '').trim();
    if (!trimmedQuestion || !trimmedAnswer) throw new Error('Both a question and answer are required');
    const ok = await verifyPassword(db, userId, currentPassword);
    if (!ok) throw new Error('Current password is incorrect');
    const answerHash = await bcrypt.hash(trimmedAnswer.toLowerCase(), 10);
    await db.execute({ sql: 'UPDATE users SET security_question = ?, security_answer_hash = ? WHERE id = ?', args: [trimmedQuestion, answerHash, userId] });
    return true;
}

module.exports = {
    ensureUsersTable, ensureSecurityQuestionColumns, signUp, signIn, userExists, verifyPassword, changePassword,
    getSecurityQuestion, resetPasswordWithSecurityAnswer, getOwnSecurityQuestion, setSecurityQuestion,
};