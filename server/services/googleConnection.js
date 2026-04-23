const crypto = require('crypto');
const { encrypt, decrypt, isEncryptionConfigured } = require('../utils/encryption');

const GOOGLE_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
];

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

const CLIENT_ID_KEY = 'GOOGLE_CLIENT_ID';
const CLIENT_SECRET_KEY = 'GOOGLE_CLIENT_SECRET_ENC';
const REDIRECT_URI_OVERRIDE_KEY = 'GOOGLE_REDIRECT_URI_OVERRIDE';

function getSetting(db, key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setSetting(db, key, value) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getOAuthConfig(db) {
    const clientId = getSetting(db, CLIENT_ID_KEY) || '';
    const clientSecretEnc = getSetting(db, CLIENT_SECRET_KEY) || '';
    const redirectUriOverride = getSetting(db, REDIRECT_URI_OVERRIDE_KEY) || '';
    return { clientId, clientSecretEnc, redirectUriOverride };
}

function getOAuthStatus(db) {
    const { clientId, clientSecretEnc, redirectUriOverride } = getOAuthConfig(db);
    return {
        has_client_id: !!clientId,
        has_client_secret: !!clientSecretEnc,
        client_id_preview: clientId ? clientId.slice(0, 16) + (clientId.length > 16 ? '...' : '') : '',
        redirect_uri_override: redirectUriOverride,
        encryption_configured: isEncryptionConfigured(),
    };
}

function saveOAuthConfig(db, { clientId, clientSecret, redirectUriOverride }) {
    if (clientId !== undefined) {
        setSetting(db, CLIENT_ID_KEY, (clientId || '').trim());
    }
    if (clientSecret !== undefined && clientSecret !== null && clientSecret !== '') {
        setSetting(db, CLIENT_SECRET_KEY, encrypt(clientSecret.trim()));
    }
    if (redirectUriOverride !== undefined) {
        setSetting(db, REDIRECT_URI_OVERRIDE_KEY, (redirectUriOverride || '').trim());
    }
}

function clearOAuthSecret(db) {
    setSetting(db, CLIENT_SECRET_KEY, '');
}

function deriveRedirectUri(db, request) {
    const override = getSetting(db, REDIRECT_URI_OVERRIDE_KEY);
    if (override && override.trim()) return override.trim();

    const forwardedProto = request.headers['x-forwarded-proto'];
    const forwardedHost = request.headers['x-forwarded-host'];
    const host = forwardedHost || request.headers.host;
    const proto = forwardedProto || request.protocol || 'http';
    if (!host) throw new Error('Could not determine redirect URI from request.');
    return `${proto}://${host}/api/connections/google/callback`;
}

function pruneOldStates(db) {
    db.prepare(
        "DELETE FROM google_oauth_states WHERE datetime(created_at) < datetime('now', '-15 minutes')"
    ).run();
}

function createAuthState(db, redirectUri, returnUrl) {
    pruneOldStates(db);
    const state = crypto.randomBytes(24).toString('base64url');
    db.prepare(
        'INSERT INTO google_oauth_states (state, redirect_uri, return_url) VALUES (?, ?, ?)'
    ).run(state, redirectUri, returnUrl || null);
    return state;
}

function consumeAuthState(db, state) {
    pruneOldStates(db);
    const row = db.prepare('SELECT state, redirect_uri, return_url FROM google_oauth_states WHERE state = ?').get(state);
    if (row) {
        db.prepare('DELETE FROM google_oauth_states WHERE state = ?').run(state);
    }
    return row;
}

function buildAuthUrl(db, { redirectUri, state, loginHint }) {
    const { clientId } = getOAuthConfig(db);
    if (!clientId) throw new Error('Google Client ID is not configured.');

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        state,
    });
    if (loginHint) params.set('login_hint', loginHint);
    return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeCodeForTokens(db, { code, redirectUri }) {
    const { clientId, clientSecretEnc } = getOAuthConfig(db);
    if (!clientId || !clientSecretEnc) {
        throw new Error('Google OAuth credentials are not configured.');
    }
    const clientSecret = decrypt(clientSecretEnc);

    const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
    });

    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Token exchange failed: ${res.status} ${errText}`);
    }
    return await res.json();
}

async function fetchUserInfo(accessToken) {
    const res = await fetch(USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to fetch userinfo: ${res.status} ${errText}`);
    }
    return await res.json();
}

function upsertGoogleAccount(db, { sub, email, name, picture, tokens }) {
    const existing = db.prepare('SELECT id, refresh_token_enc FROM google_accounts WHERE google_sub = ?').get(sub);
    const expiresInSec = tokens.expires_in || 3600;
    const expiry = new Date(Date.now() + expiresInSec * 1000).toISOString();

    const accessEnc = encrypt(tokens.access_token);
    const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : (existing ? existing.refresh_token_enc : null);
    const scopes = tokens.scope || GOOGLE_SCOPES.join(' ');

    if (existing) {
        db.prepare(`
            UPDATE google_accounts
            SET email = ?, name = ?, picture = ?, access_token_enc = ?, refresh_token_enc = ?,
                token_expiry = ?, scopes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(email, name, picture, accessEnc, refreshEnc, expiry, scopes, existing.id);
        return existing.id;
    } else {
        const result = db.prepare(`
            INSERT INTO google_accounts (google_sub, email, name, picture, access_token_enc, refresh_token_enc, token_expiry, scopes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sub, email, name, picture, accessEnc, refreshEnc, expiry, scopes);
        return result.lastInsertRowid;
    }
}

function getConnectedAccount(db) {
    const row = db.prepare(`
        SELECT id, email, name, picture, token_expiry, scopes, created_at, updated_at
        FROM google_accounts
        ORDER BY id ASC
        LIMIT 1
    `).get();
    return row || null;
}

async function refreshAccessToken(db, accountId) {
    const row = db.prepare('SELECT refresh_token_enc FROM google_accounts WHERE id = ?').get(accountId);
    if (!row || !row.refresh_token_enc) {
        throw new Error('No refresh token available for this Google account.');
    }
    const refreshToken = decrypt(row.refresh_token_enc);
    const { clientId, clientSecretEnc } = getOAuthConfig(db);
    const clientSecret = decrypt(clientSecretEnc);

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
    });

    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Token refresh failed: ${res.status} ${errText}`);
    }
    const tokens = await res.json();
    const expiresInSec = tokens.expires_in || 3600;
    const expiry = new Date(Date.now() + expiresInSec * 1000).toISOString();
    const accessEnc = encrypt(tokens.access_token);
    db.prepare('UPDATE google_accounts SET access_token_enc = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(accessEnc, expiry, accountId);
    return tokens.access_token;
}

async function getValidAccessToken(db, accountId) {
    const row = db.prepare('SELECT access_token_enc, token_expiry FROM google_accounts WHERE id = ?').get(accountId);
    if (!row) throw new Error('Google account not found.');
    const expiry = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
    if (Date.now() < expiry - 60 * 1000 && row.access_token_enc) {
        return decrypt(row.access_token_enc);
    }
    return await refreshAccessToken(db, accountId);
}

async function revokeAndDisconnect(db, accountId) {
    const row = db.prepare('SELECT access_token_enc, refresh_token_enc FROM google_accounts WHERE id = ?').get(accountId);
    if (!row) return;
    const tokens = [];
    if (row.refresh_token_enc) {
        try { tokens.push(decrypt(row.refresh_token_enc)); } catch (_) {}
    }
    if (row.access_token_enc) {
        try { tokens.push(decrypt(row.access_token_enc)); } catch (_) {}
    }
    for (const token of tokens) {
        try {
            await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' });
        } catch (err) {
            console.warn('Failed to revoke Google token:', err.message);
        }
    }
    db.prepare('DELETE FROM google_accounts WHERE id = ?').run(accountId);
}

module.exports = {
    GOOGLE_SCOPES,
    getOAuthStatus,
    saveOAuthConfig,
    clearOAuthSecret,
    deriveRedirectUri,
    createAuthState,
    consumeAuthState,
    buildAuthUrl,
    exchangeCodeForTokens,
    fetchUserInfo,
    upsertGoogleAccount,
    getConnectedAccount,
    refreshAccessToken,
    getValidAccessToken,
    revokeAndDisconnect,
};
