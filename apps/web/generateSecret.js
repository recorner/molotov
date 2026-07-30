import fs from 'fs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const secretFilePath = '/app/jwt_secret.json';

function generateRandomSecretKey() {
  const secretKeyBuffer = crypto.randomBytes(32); // 32 bytes = 256 bits
  return secretKeyBuffer.toString('hex');
}

function generateJWTSecret() {
  const secretKey = generateRandomSecretKey();
  const secret = jwt.sign({ data: 'someSecretData' }, secretKey, { expiresIn: '1h' });
  fs.writeFileSync(secretFilePath, JSON.stringify({ secret, createdAt: Date.now(), secretKey }));
  console.log('New JWT Secret and Secret Key generated.');
}

generateJWTSecret();
setInterval(generateJWTSecret, 60 * 60 * 1000); // Generate a new secret every hour

console.log('JWT Secret generation script is running.');
