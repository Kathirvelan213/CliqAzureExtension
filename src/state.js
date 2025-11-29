const crypto = require('crypto');
const SECRET = process.env.STATE_SECRET || 'state-secret-default-please-change';

function encodeState(obj) {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(SECRET).digest();
  const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
  const json = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([iv, encrypted]).toString('base64');
  return encodeURIComponent(payload);
}

function decodeState(payloadEncoded) {
  const payload = Buffer.from(decodeURIComponent(payloadEncoded), 'base64');
  const iv = payload.slice(0, 16);
  const encrypted = payload.slice(16);
  const key = crypto.createHash('sha256').update(SECRET).digest();
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

module.exports = { encodeState, decodeState };
