require('dotenv').config();
const express = require('express');
const cors = require('cors');

const auth = require('./src/auth');
const azureClient = require('./src/azureClient');
const state = require('./src/state');
const cliqApi = require('./src/cliqApi');

const storeMode = process.env.STORAGE_MODE || 'file';
const store = require(`./src/store_${storeMode}`); // store_file or store_cliq (template)

const app = express();
app.use(cors());
app.use(express.json());

// Health
app.get('/', (req, res) => res.send({ ok: true, message: 'Cliq Azure OAuth backend running' }));

/**
 * Cliq command entrypoint
 * Cliq will POST the full command payload here.
 * Example body (from Cliq): { user: { id: 'zl_123' }, text: 'myapp' ... }
 */
app.post('/cliq/appstatus', async (req, res) => {
  try {
    console.log(req.body); // log full payload for debugging
    console.log(req.headers); // log full payload for debugging
    const cliqUser = req.body.user;
    const argsText = (req.body.text || '').trim(); // supports one param usage
    const appName = argsText.split(/\s+/)[0]; // basic parsing; or parse JSON payload

    if (!cliqUser || !cliqUser.id) {
      return res.send({ text: 'Error: missing Cliq user id' });
    }
    if (!appName) {
      return res.send({ text: 'Usage: /appstatus <appName> (optionally resourceGroup,subscription via card)' });
    }

    const cliqUserId = cliqUser.id;

    // Check storage for tokens for this cliqUserId
    const tokenRow = await store.get(cliqUserId);

    if (!tokenRow || !tokenRow.accessToken) {
      // Build state: contains cliqUserId + original command arguments
      const encoded = state.encodeState({
        cliqUserId,
        command: 'appstatus',
        args: { appName }
      });

      const loginUrl = `${process.env.APP_BASE_URL}/auth/login?state=${encoded}`;

      // Return a Cliq card instructing user to authenticate
      // Cliq will render the returned JSON as a card.
      return res.send({
        card: {
          theme: 'modern',
          title: 'Sign in to Azure',
          subtitle: `To check "${appName}" we need you to sign in to your Azure account.`,
          sections: [
            {
              widgets: [
                {
                  type: 'button',
                  text: 'Sign in with Microsoft',
                  onClick: {
                    type: 'openUrl',
                    url: loginUrl
                  }
                }
              ]
            }
          ]
        }
      });
    }

    // User has stored tokens — ensure valid and fetch status
    const accessToken = await auth.ensureValidAccessTokenForUser(cliqUserId, store);
    // determine subscriptionId if not provided (naive: use first)
    let subId = tokenRow.subscriptionId;
    if (!subId) {
      const subs = await azureClient.listSubscriptions(accessToken);
      if (!subs || subs.length === 0) {
        return res.send({ text: 'No Azure subscriptions found for your account.' });
      }
      subId = subs[0].subscriptionId;
      // optional: persist subId
      await store.upsert(cliqUserId, { ...tokenRow, subscriptionId: subId });
    }

    // Try to find resource group automatically
    let rg = req.body.resourceGroup;
    if (!rg) {
      const found = await azureClient.findWebApp(subId, accessToken, appName);
      rg = found && found.resourceGroup;
    }

    if (!rg) {
      return res.send({ text: 'Could not determine resource group. Please provide resourceGroup param or use the card UI.' });
    }

    const appInfo = await azureClient.getWebApp(subId, rg, appName, accessToken);

    // Return a nice card with status
    const responseCard = {
      card: {
        theme: 'modern',
        title: `Azure App Status — ${appInfo.name}`,
        sections: [
          { widgets: [{ type: 'text', text: `State: **${appInfo.state || 'Unknown'}**` }] },
          { widgets: [{ type: 'text', text: `Hostnames: ${Array.isArray(appInfo.hostNames) ? appInfo.hostNames.join(', ') : appInfo.hostNames}` }] },
          { widgets: [{ type: 'text', text: `Last Modified: ${appInfo.lastModified || 'N/A'}` }] }
        ]
      }
    };

    return res.send(responseCard);

  } catch (err) {
    console.error('/cliq/appstatus error', err);
    return res.send({ text: `Error: ${err.message}` });
  }
});

// Step 1: redirect user to login (state forwarded from Cliq)
app.get('/auth/login', (req, res) => {
  const incomingState = req.query.state;
  const loginUrl = auth.getAuthUrl(incomingState);
  res.redirect(loginUrl);
});


// Step 2: callback - exchange code, create user session, persist tokens under cliqUserId and continue original command
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, state: encodedState, error, error_description } = req.query;
    if (error) {
      console.error('OAuth error', error, error_description);
      return res.status(400).send(`OAuth error: ${error_description || error}`);
    }
    if (!code) return res.status(400).send('Missing authorization code');

    const decoded = state.decodeState(encodedState);
    const cliqUserId = decoded.cliqUserId;
    if (!cliqUserId) return res.status(400).send('Invalid state: no cliqUserId');

    // exchange code for tokens (using tenant-agnostic token endpoint; auth.register... will record tenant)
    const tokenResponse = await auth.acquireTokenByCode(code, decoded);

    // register user in storage under cliqUserId
    const user = await auth.registerOrUpdateUserFromTokenResponse(tokenResponse, cliqUserId, store);

    // Resume original command
    if (decoded.command === 'appstatus') {
      // send intermediate message to user in Cliq
      await cliqApi.sendMessageToCliqUser(cliqUserId, { text: 'Authentication complete — fetching app status now...' });

      // run same logic as endpoint (we call azureClient directly)
      const accessToken = await auth.ensureValidAccessTokenForUser(cliqUserId, store);
      let subId = user.subscriptionId;
      if (!subId) {
        const subs = await azureClient.listSubscriptions(accessToken);
        if (!subs || subs.length === 0) {
          await cliqApi.sendMessageToCliqUser(cliqUserId, { text: 'No Azure subscriptions found for your account.' });
          return res.send('Done — no subscriptions');
        }
        subId = subs[0].subscriptionId;
        await store.upsert(cliqUserId, { ...user, subscriptionId: subId });
      }

      const appName = decoded.args.appName;
      // determine rg
      const found = await azureClient.findWebApp(subId, accessToken, appName);
      const rg = found && found.resourceGroup;
      if (!rg) {
        await cliqApi.sendMessageToCliqUser(cliqUserId, { text: `Could not determine resource group for ${appName}. Provide resourceGroup.` });
        return res.send('Done — ambiguous resource group');
      }

      const appInfo = await azureClient.getWebApp(subId, rg, appName, accessToken);
      const card = {
        card: {
          theme: 'modern',
          title: `Azure App Status — ${appInfo.name}`,
          sections: [
            { widgets: [{ type: 'text', text: `State: **${appInfo.state || 'Unknown'}**` }] },
            { widgets: [{ type: 'text', text: `Hostnames: ${Array.isArray(appInfo.hostNames) ? appInfo.hostNames.join(', ') : appInfo.hostNames}` }] },
            { widgets: [{ type: 'text', text: `Last Modified: ${appInfo.lastModified || 'N/A'}` }] }
          ]
        }
      };
      await cliqApi.sendMessageToCliqUser(cliqUserId, card);
    }

    // Show a browser message to the user (they will return to Cliq)
    return res.send('<html><body><h3>Authentication complete — return to Zoho Cliq.</h3></body></html>');

  } catch (err) {
    console.error('/auth/callback error', err);
    return res.status(500).send(`Callback error: ${err.message}`);
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
