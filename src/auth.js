const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const TENANT = 'common'; // multi-tenant signin
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const redirectUri = process.env.AZURE_REDIRECT_URI;

// Build authorization URL; accepts optional incomingState (already encoded)
function getAuthUrl(passedState) {
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'https://management.azure.com/user_impersonation'
  ];

  const url = new URL(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', scopes.join(' '));

  // THE KEY FIX:
  url.searchParams.set('state', passedState);

  return url.toString();
}


async function acquireTokenByCode(code) {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('scope', 'openid profile offline_access https://management.azure.com/user_impersonation');
  params.append('code', code);
  params.append('redirect_uri', redirectUri);
  params.append('grant_type', 'authorization_code');
  params.append('client_secret', clientSecret);

  const resp = await axios.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return resp.data;
}

async function refreshToken(refresh_token, tenantIdFromUser) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantIdFromUser}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refresh_token);
  params.append('scope', 'openid profile offline_access https://management.azure.com/user_impersonation');

  const resp = await axios.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return resp.data;
}

// Helper: decode id_token payload (no signature verification — acceptable for flow mapping; verify in prod)
function decodeIdToken(id_token) {
  if (!id_token) return {};
  const parts = id_token.split('.');
  if (parts.length < 2) return {};
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const buf = Buffer.from(payload, 'base64');
  return JSON.parse(buf.toString('utf8'));
}

/**
 * Save token data under cliqUserId using provided store implementation.
 * tokenResponse: access_token, refresh_token, id_token, expires_in
 * store: must implement upsert(cliqUserId, data) and get(cliqUserId)
 */
async function registerOrUpdateUserFromTokenResponse(tokenResponse, cliqUserId, store) {
  const payload = decodeIdToken(tokenResponse.id_token);
  const azureUserId = payload.oid || payload.sub;
  const tenantId = payload.tid;
  const now = Date.now();
  const expiresAt = now + (tokenResponse.expires_in * 1000) - 30000;
  const userRow = {
    azureUserId,
    tenantId,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt
  };
  await store.upsert(cliqUserId, userRow);
  return { id: cliqUserId, ...userRow };
}

async function getUser(cliqUserId, store) {
  // returns the stored row for the cliq user
  return store.get(cliqUserId);
}

async function ensureValidAccessTokenForUser(cliqUserId, store) {
  const user = await getUser(cliqUserId, store);
  if (!user) throw new Error('user not found');

  const now = Date.now();
  if (user.accessToken && user.expiresAt && user.expiresAt > now + 5000) {
    return user.accessToken;
  }
  if (!user.refreshToken) throw new Error('no refresh token available; reauthenticate');

  // refresh
  const tokenResponse = await refreshToken(user.refreshToken, user.tenantId);
  user.accessToken = tokenResponse.access_token;
  user.refreshToken = tokenResponse.refresh_token || user.refreshToken;
  user.expiresAt = Date.now() + (tokenResponse.expires_in * 1000) - 30000;
  await store.upsert(cliqUserId, user);
  return user.accessToken;
}

module.exports = {
  getAuthUrl,
  acquireTokenByCode,
  registerOrUpdateUserFromTokenResponse,
  getUser,
  ensureValidAccessTokenForUser
};
