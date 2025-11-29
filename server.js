require('dotenv').config();
const express = require('express');
const cors = require('cors');

const auth = require('./src/auth');
const azureClient = require('./src/azureClient');

const app = express();
app.use(cors());
app.use(express.json());

// Simple health
app.get('/', (req, res) => res.send({ ok: true, message: 'Cliq Azure OAuth backend running' }));

// Step 1: redirect user to login
app.get('/auth/login', (req, res) => {
  // optional: pass a 'state' or 'returnTo' that your Cliq UI can use
  const loginUrl = auth.getAuthUrl();
  res.redirect(loginUrl);
});

// Step 2: callback - exchange code, create local user session (demo: return user id)
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    if (error) {
      return res.status(400).send({ ok: false, error, error_description });
    }
    if (!code) return res.status(400).send({ ok: false, error: 'missing_code' });

    const tokenResponse = await auth.acquireTokenByCode(code);
    // tokenResponse contains: access_token, refresh_token, id_token, expires_in, scope, tenant
    const user = await auth.registerOrUpdateUserFromTokenResponse(tokenResponse);

    // For demo: return JSON with user id and next steps (in production you'd redirect back to Cliq UI)
    return res.send({
      ok: true,
      message: 'Signed in',
      userId: user.id,
      account: user.preferred_username || user.displayName,
    });
  } catch (err) {
    console.error('callback error', err);
    return res.status(500).send({ ok: false, error: err.message });
  }
});

// Main API: get app status for the signed-in user
// This demo expects a `userId` query param (you may map this to Cliq user IDs)
app.get('/appstatus', async (req, res) => {
  try {
    const userId = req.query.userId; // in production map Cliq user -> stored user
    const appName = req.query.app;
    const resourceGroup = req.query.resourceGroup; // optional
    const subscriptionId = req.query.subscriptionId; // optional

    if (!userId) return res.status(400).json({ ok: false, error: 'missing userId (map Cliq user to this value)' });
    if (!appName) return res.status(400).json({ ok: false, error: 'missing app name param' });

    // ensure tokens exist and refresh if needed
    const user = await auth.getUser(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'user not found; authenticate first via /auth/login' });

    const accessToken = await auth.ensureValidAccessTokenForUser(userId);

    // determine subscriptionId if not provided
    let subId = subscriptionId;
    if (!subId) {
      const subs = await azureClient.listSubscriptions(accessToken);
      if (!subs || subs.length === 0) {
        return res.status(400).json({ ok: false, error: 'no subscriptions found for user' });
      }
      subId = subs[0].subscriptionId;
    }

    // determine resourceGroup if not provided: optional attempt (we still prefer user to pass it)
    let rg = resourceGroup;
    if (!rg) {
      // Try to find a web app resource that matches the name across resource groups (naive)
      const found = await azureClient.findWebApp(subscriptionId || subId, accessToken, appName);
      if (found && found.resourceGroup) rg = found.resourceGroup;
    }

    if (!rg) return res.status(400).json({ ok: false, error: 'resourceGroup not provided and could not be inferred; add resourceGroup param' });

    // finally fetch the web app
    const appInfo = await azureClient.getWebApp(subscriptionId || subId, rg, appName, accessToken);

    return res.json({ ok: true, data: appInfo });

  } catch (err) {
    console.error('/appstatus error', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
