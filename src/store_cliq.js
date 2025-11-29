/**
 * Template for Zoho Cliq Data Store integration.
 * Replace the two functions below with actual calls to Zoho Cliq Data Store API for your extension.
 *
 * You'll likely need:
 * - An extension auth token (server-to-server) or the appropriate headers
 * - The exact REST endpoint for Cliq extension DB (see Zoho docs)
 *
 * Example function signatures:
 *  - get(cliqUserId) -> returns stored object or null
 *  - upsert(cliqUserId, value) -> stores object and returns it
 *
 * For now these functions throw an error to remind you to implement them.
 */

async function get(key) {
  throw new Error('store_cliq.get not implemented. Replace with call to Zoho Cliq Data Store API.');
}

async function upsert(key, value) {
  throw new Error('store_cliq.upsert not implemented. Replace with call to Zoho Cliq Data Store API.');
}

async function del(key) {
  throw new Error('store_cliq.delete not implemented. Replace with call to Zoho Cliq Data Store API.');
}

module.exports = { get, upsert, delete: del };
