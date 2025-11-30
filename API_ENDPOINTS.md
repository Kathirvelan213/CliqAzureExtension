# API Endpoints

## Server Endpoints

### 1. Health Check
- **Method:** `GET`
- **Path:** `/`
- **Description:** Health check endpoint to verify the server is running
- **Response:** `{ ok: true, message: 'Cliq Azure OAuth backend running' }`

---

### 2. Cliq App Status Command
- **Method:** `POST`
- **Path:** `/cliq/appstatus`
- **Description:** Main entry point for Cliq commands to check Azure App Service status
- **Request Body:**
  ```json
  {
    "user": {
      "id": "zl_123"
    },
    "text": "<appName>",
    "resourceGroup": "<optional>"
  }
  ```
- **Functionality:**
  - Checks if user has stored Azure OAuth tokens
  - If no tokens: Returns a Cliq card with "Sign in with Microsoft" button
  - If tokens exist: Fetches Azure App Service status and returns info card
  - Automatically determines subscription and resource group if not provided
- **Response:** Cliq card with either:
  - Sign-in button (if not authenticated)
  - App status information (state, hostnames, last modified)
  - Error message

---

### 3. Azure OAuth Login
- **Method:** `GET`
- **Path:** `/auth/login`
- **Description:** Initiates Azure OAuth flow by redirecting user to Microsoft login
- **Query Parameters:**
  - `state` - Encoded state containing cliqUserId and command context
- **Functionality:**
  - Generates Azure OAuth URL with state parameter
  - Redirects user to Microsoft login page

---

### 4. Azure OAuth Callback
- **Method:** `GET`
- **Path:** `/auth/callback`
- **Description:** OAuth callback endpoint that handles Azure authentication response
- **Query Parameters:**
  - `code` - Authorization code from Azure
  - `state` - Encoded state (contains cliqUserId and original command)
  - `error` - Error code (if auth failed)
  - `error_description` - Error details (if auth failed)
- **Functionality:**
  - Exchanges authorization code for access/refresh tokens
  - Stores tokens in storage under cliqUserId
  - Resumes original command execution (e.g., appstatus)
  - Sends status update to Cliq user
  - Returns browser confirmation page
- **Response:** HTML page confirming authentication complete

---

## Azure API Calls (via azureClient.js)

### List Subscriptions
- **Azure API:** `GET https://management.azure.com/subscriptions?api-version=2020-01-01`
- **Description:** Retrieves all Azure subscriptions for the authenticated user
- **Returns:** Array of subscription objects

### Get Web App
- **Azure API:** `GET https://management.azure.com/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Web/sites/{appName}?api-version=2022-03-01`
- **Description:** Retrieves details about a specific Azure App Service
- **Returns:** Object with app name, state, hostnames, last modified time

### Find Web App
- **Azure API:** `GET https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Web/sites?api-version=2022-03-01`
- **Description:** Searches for an app service by name across all resource groups
- **Returns:** App object with resource group information if found

---

## Cliq API Calls (via cliqApi.js)

### Send Message to Cliq User
- **Function:** `sendMessageToCliqUser(cliqUserId, payload)`
- **Description:** Sends a message or card to a Cliq user (currently logs to console; needs bot token for production)
- **Payload:** Can be `{ text: '...' }` or `{ card: {...} }`
- **Note:** Production implementation requires Cliq Bot OAuth token

---

## Environment Variables Required

- `APP_BASE_URL` - Base URL for the application (used in OAuth redirect)
- `PORT` - Server port (defaults to 3000)
- `STORAGE_MODE` - Storage mode: 'file' or 'cliq' (defaults to 'file')
- Azure OAuth credentials (managed in auth.js)
- `CLIQ_BOT_TOKEN` - Required for production Cliq message sending

---

## Flow Summary

1. User invokes `/appstatus <appName>` in Cliq
2. POST request sent to `/cliq/appstatus`
3. If not authenticated → Returns card with login button → User clicks → GET `/auth/login` → Redirects to Azure
4. User authenticates → Azure redirects to GET `/auth/callback` → Tokens stored
5. Original command resumes → Fetches app status from Azure APIs → Sends result to Cliq user
