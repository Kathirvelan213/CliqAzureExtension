const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const TENANT = 'common'; // multi-tenant signin
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const redirectUri = process.env.AZURE_REDIRECT_URI;
const appBase = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT||3000}`;

// Simple in-memory user/token store (replace with DB for production)
// key: userId, value: { id, preferred_username, tenantId, accessToken, refreshToken, expiresAt }
const store = new Map();

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64').toString('utf8');
}

function decodeIdToken(id_token) {
  // naive decode without verification for demo
  const parts = id_token.split('.');
  if (parts.length < 2) return {};
  const payload = JSON.parse(base64UrlDecode(parts[1]));
  return payload;
}

// Build authorization URL
function getAuthUrl() {
  const scopes = [
    'openid',
    'profile',
    'offline_access', // to receive refresh_token
    // delegated ARM permission
    'https://management.azure.com/user_impersonation'
  ];
  const url = new URL(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', scopes.join(' '));
  // optionally set a state param
  url.searchParams.set('state', uuidv4());
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
  // resp.data: access_token, expires_in, refresh_token, id_token
  return resp.data;
}

async function refreshToken(refresh_token, tenantIdFromUser) {
  // Use tenant-specific token endpoint
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

async function registerOrUpdateUserFromTokenResponse(tokenResponse) {
  // tokenResponse includes id_token (contains user info + tenant) and access/refresh tokens
  const idToken = tokenResponse.id_token;
  const payload = decodeIdToken(idToken);
  const userId = payload.oid || payload.sub || payload.email || payload.preferred_username;
  if (!userId) throw new Error('id_token does not contain user id (oid)');

  const tenantId = payload.tid; // user's tenant
  const now = Date.now();
  const expiresAt = now + (tokenResponse.expires_in * 1000) - 30000; // 30s buffer

  const user = {
    id: userId,
    preferred_username: payload.preferred_username || payload.email || payload.upn,
    displayName: payload.name,
    tenantId,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt
  };

  store.set(userId, user);
  return user;
}

async function getUser(userId) {
  return store.get(userId);
}

// ensure access token valid; refresh if expired
async function ensureValidAccessTokenForUser(userId) {
  const user = await getUser(userId);
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
  store.set(userId, user);
  return user.accessToken;
}

module.exports = {
  getAuthUrl,
  acquireTokenByCode,
  registerOrUpdateUserFromTokenResponse,
  getUser,
  ensureValidAccessTokenForUser,
  // exports for tests / debugging
  _store: store
};
