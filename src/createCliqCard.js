// helper
// create a response card

function createLoginCard(appName, loginUrl){
  return {
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
      }
}

function createResponseCard(appInfo) {
    const responseCard = {
      card: {
        theme: 'modern-inline',
        title: `Azure App Status — ${appInfo.name}`,
      },
      slides: [
          { type: 'text', data: `*State*: ${appInfo.state || 'Unknown'}` },
          { type: 'text', data: `*Hostnames*: ${Array.isArray(appInfo.hostNames) ? appInfo.hostNames.join(', ') : appInfo.hostNames}` },
          { type: 'text', data: `*Last Modified*: ${appInfo.lastModified || 'N/A'}` }
          // { type: 'text', data: `*Raw*: ${appInfo.raw || 'Unknown'}` },
        ]
    };

    return responseCard;
}

module.exports = { createLoginCard, createResponseCard }