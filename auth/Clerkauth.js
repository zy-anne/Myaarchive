// ─── Clerk Auth for Electron ────────────────────────────────────────────
//
// Clerk's first-party SDKs target web and React Native/Expo — there's no
// official Electron SDK. The standard pattern for desktop apps (used by
// Clerk's own docs example and by tools like Linear/Raycast-style apps) is:
//
//   1. Register a custom protocol (`myaarchive://`) as this app's handler.
//   2. "Sign in" opens the user's SYSTEM browser (not an in-app webview —
//      Clerk needs real cookies/passkeys/social-login redirects, which a
//      bare BrowserWindow webview handles poorly and which platform
//      guidelines discourage for OAuth anyway) to a small hosted page.
//   3. That hosted page is a minimal web app with Clerk's <SignIn/>
//      component. After a successful sign-in, it calls Clerk's
//      `getToken()` and redirects to
//      `myaarchive://auth-callback?token=<session_token>`.
//   4. The OS hands that URL back to the already-running (or newly
//      launched) Electron app via the `open-url` (macOS) or second-instance
//      argv (Windows/Linux) mechanism.
//   5. main.js extracts the token and calls verifySessionToken() below,
//      which validates it server-side via @clerk/backend and returns the
//      Clerk user id — that id is what gets passed as `ownerId` into every
//      data-layer call.
//
// This file only covers step 5 (verification) plus the URL helpers for
// steps 2–4; the actual hosted sign-in page is a separate tiny deploy
// (e.g. one Next.js page on Vercel) that isn't part of this repo.
//
// Env vars required:
//   CLERK_SECRET_KEY               — used server-side (in this Electron
//                                     main process) to verify tokens
//   CLERK_HOSTED_SIGNIN_URL         — e.g. https://auth.myaarchive.app/sign-in
//   ELECTRON_PROTOCOL (optional)    — defaults to 'myaarchive'

const { verifyToken, createClerkClient } = require('@clerk/backend');

const PROTOCOL = process.env.ELECTRON_PROTOCOL || 'myaarchive';

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

function buildSignInUrl(hostedSignInUrl) {
    const callback = `${PROTOCOL}://auth-callback`;
    const url = new URL(hostedSignInUrl);
    url.searchParams.set('redirect_uri', callback);
    return url.toString();
}

/** Parses the myaarchive://auth-callback?token=... URL the OS hands back. */
function parseCallbackUrl(callbackUrl) {
    const url = new URL(callbackUrl);
    return { token: url.searchParams.get('token') };
}

/**
 * Verifies the short-lived token from the initial sign-in redirect and
 * returns BOTH the user id and the session id. The token itself is
 * deliberately not returned for storage — it expires in ~60 seconds. What
 * you persist across launches is `sessionId`, via restoreFromSessionId().
 */
async function verifySessionToken(token) {
    if (!token) return null;
    try {
        const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
        return { userId: payload.sub, sessionId: payload.sid };
    } catch {
        return null; // expired/invalid — caller should re-trigger sign-in
    }
}

/**
 * Called on app launch with a previously-saved session id. Asks Clerk's
 * backend whether that session is still active (rather than reusing an old
 * token) and returns the user id if so, or null if the session has expired,
 * been revoked, or signed out elsewhere — at which point the caller should
 * fall back to showing the sign-in gate again.
 *
 * How long a session stays valid this way is controlled in the Clerk
 * Dashboard under Sessions settings ("Inactivity timeout" / "Maximum
 * lifetime") — that setting IS your "keep me signed in" duration knob, not
 * anything in this codebase.
 */
async function restoreFromSessionId(sessionId) {
    if (!sessionId) return null;
    try {
        const session = await clerkClient.sessions.getSession(sessionId);
        if (session.status !== 'active') return null;
        return { userId: session.userId };
    } catch {
        return null; // session id invalid/revoked/not found
    }
}

module.exports = { PROTOCOL, buildSignInUrl, parseCallbackUrl, verifySessionToken, restoreFromSessionId };
