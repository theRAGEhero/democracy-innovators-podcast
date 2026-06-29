const crypto = require('crypto');

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: node scripts/generate-admin-hash.js "VeryStrongPassword" (min 10 chars)');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
console.log(`${salt.toString('hex')}:${hash.toString('hex')}`);
