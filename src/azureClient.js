const { DefaultAzureCredential } = require("@azure/identity");
const { WebSiteManagementClient } = require("@azure/arm-appservice");
const config = require("./config/settings");

async function getAppStatus(appName) {
    const credential = new DefaultAzureCredential();
    const client = new WebSiteManagementClient(
        credential,
        config.subscriptionId
    );

    const result = await client.webApps.get(
        config.resourceGroup,
        appName
    );

    return {
        name: result.name,
        state: result.state,
        hostNames: result.defaultHostName || result.hostNames,
        lastModified: result.lastModifiedTimeUtc,
        httpsOnly: result.httpsOnly
    };
}

module.exports = { getAppStatus };
