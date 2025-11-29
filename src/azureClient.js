const axios = require('axios');

async function listSubscriptions(accessToken) {
  const url = 'https://management.azure.com/subscriptions?api-version=2020-01-01';
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return resp.data.value || [];
}

async function getWebApp(subscriptionId, resourceGroup, appName, accessToken) {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${appName}?api-version=2022-03-01`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = resp.data;
  return {
    name: data.name,
    state: data.properties && data.properties.state,
    hostNames: data.properties && (data.properties.hostNames || data.properties.defaultHostName),
    lastModified: data.properties && data.properties.lastModifiedTimeUtc,
    raw: data
  };
}

async function findWebApp(subscriptionId, accessToken, appName) {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Web/sites?api-version=2022-03-01`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const list = resp.data.value || [];
  for (const item of list) {
    if (item.name && item.name.toLowerCase() === appName.toLowerCase()) {
      const parts = item.id.split('/');
      const rgIndex = parts.findIndex(p => p.toLowerCase() === 'resourcegroups');
      const resourceGroup = rgIndex >= 0 ? parts[rgIndex + 1] : null;
      return { resourceGroup, ...item };
    }
  }
  return null;
}

module.exports = { listSubscriptions, getWebApp, findWebApp };
