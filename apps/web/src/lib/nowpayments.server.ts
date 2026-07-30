import crypto from 'crypto';

/** Server-only NOWPayments helpers: IPN signature verification. */

/** Recursively sort object keys (NOWPayments signs the recursively key-sorted JSON). */
export function sortObject(obj: any): any {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = sortObject(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

/** Verify a NOWPayments IPN HMAC-SHA512 signature against the request body. */
export function verifyIpnSignature(body: unknown, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha512', secret);
  hmac.update(JSON.stringify(sortObject(body)));
  const expected = hmac.digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
