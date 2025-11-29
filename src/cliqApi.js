const axios = require('axios');

async function sendMessageToCliqUser(cliqUserId, payload) {
  // payload can be { text: '...' } or { card: {...} }
  // For testing, just log it
  console.log(`[cliqApi] sendMessageToCliqUser ${cliqUserId}:`, JSON.stringify(payload, null, 2));

  // PRODUCTION:
  // Use Zoho Cliq REST API to post message to a user (bot token required)
  // Example (pseudo):
  //
  // const BOT_AUTH_TOKEN = process.env.CLIQ_BOT_TOKEN;
  // const url = `https://cliq.zoho.com/api/v2/chats/<chat_id>/message`; // or user-specific endpoint
  // await axios.post(url, payload, { headers: { Authorization: `Zoho-oauthtoken ${BOT_AUTH_TOKEN}` } });
  //
  // If you prefer, create a private channel with the user and post to the channel.
}

module.exports = { sendMessageToCliqUser };
