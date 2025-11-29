const path = require('path');
const fs = require('fs');
const { Low, JSONFile } = require('lowdb');

// Ensure directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Path to db.json
const file = path.join(dataDir, 'db.json');

// Create adapter & database instance
const adapter = new JSONFile(file);
const db = new Low(adapter);

// Initialize DB with default structure if missing
async function init() {
  await db.read();
  db.data ||= { users: {} };
  await db.write();
}

// Get a user record
async function get(key) {
  await init();
  return db.data.users[key] || null;
}

// Create/update a user record
async function upsert(key, value) {
  await init();
  db.data.users[key] = value;
  await db.write();
  return db.data.users[key];
}

// Delete a user record
async function del(key) {
  await init();
  delete db.data.users[key];
  await db.write();
}

module.exports = { get, upsert, delete: del };
