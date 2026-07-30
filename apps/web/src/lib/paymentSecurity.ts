// Rate limiting for payment endpoints
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 payment requests per minute per IP

export function checkRateLimit(clientIP: string): boolean {
  const now = Date.now();
  const key = `payment_${clientIP}`;
  
  const current = rateLimitMap.get(key);
  
  if (!current || now - current.lastReset > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { count: 1, lastReset: now });
    return true;
  }
  
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  current.count++;
  return true;
}

export function getOriginValidation(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  
  // Allow same-origin requests
  const allowedOrigins = [
    'https://untouch.live',
    'http://localhost:5173', // Development
    'http://localhost:4173', // Preview
  ];
  
  return allowedOrigins.some(allowed => 
    origin === allowed || referer?.startsWith(allowed)
  );
}
