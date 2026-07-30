import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const validate = (token: string, rng: string, code: string) => {
  // validate jwt
  let data: any;
  try {
    data = jwt.verify(token, process.env.JWT_SECRET || '1');
  } catch (e) {
    return false;
  }

  // validate hash
  const hash = crypto
    .createHash('sha256')
    .update(code + rng)
    .digest('base64');
  return data.h === hash;
};
