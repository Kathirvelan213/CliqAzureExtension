const axios = require('axios');

const BASE = "https://cliq.zoho.com/api/v2";
const EXTENSION_ID = process.env.CLIQ_EXTENSION_ID;
const AUTH_TOKEN = process.env.CLIQ_SERVER_TOKEN;

if (!EXTENSION_ID) throw new Error("Missing CLIQ_EXTENSION_ID env variable");
if (!AUTH_TOKEN) throw new Error("Missing CLIQ_SERVER_TOKEN env variable");

const headers = {
  "Authorization": `Zoho-oauthtoken ${AUTH_TOKEN}`,
  "Content-Type": "application/json"
};

// GET user data by key (cliqUserId)
async function get(key) {
  const url = `${BASE}/extensions/${EXTENSION_ID}/data/${key}`;
  try {
    const resp = await axios.get(url, { headers });
    return resp.data.data || null;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null; // user not stored yet
    }
    throw err;
  }
}

// CREATE OR UPDATE user data
async function upsert(key, value) {
  const url = `${BASE}/extensions/${EXTENSION_ID}/data`;
  const payload = {
    key,
    data: value
  };

  const resp = await axios.post(url, payload, { headers });
  return resp.data.data;
}

// DELETE user
async function del(key) {
  const url = `${BASE}/extensions/${EXTENSION_ID}/data/${key}`;
  await axios.delete(url, { headers });
}

module.exports = { get, upsert, delete: del };
