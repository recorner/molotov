import type { RequestHandler } from './$types';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const randomString = (length: number, chars: string) => {
  let result = '';
  for (let i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
};

const palette = ['#0f766e', '#0e7490', '#1d4ed8', '#6d28d9', '#be123c', '#b45309'];
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Generate a lightweight, dependency-free SVG captcha. Returns an SVG image
 * (renderable inside an <img> tag) and sets the matching verification cookies.
 * No native modules required — safe for serverless.
 */
const buildSvg = (code: string) => {
  const width = 200;
  const height = 70;

  const glyphs = code
    .split('')
    .map((ch, i) => {
      const x = 22 + i * 28 + (Math.random() * 6 - 3);
      const y = 46 + (Math.random() * 10 - 5);
      const rotate = Math.random() * 40 - 20;
      const size = 30 + Math.floor(Math.random() * 8);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-family="'Arial Black', Arial, sans-serif" font-weight="bold" fill="${pick(
        palette
      )}" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${ch}</text>`;
    })
    .join('');

  // noise lines
  let noise = '';
  for (let i = 0; i < 6; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    noise += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(
      1
    )}" stroke="${pick(palette)}" stroke-width="1" opacity="0.4"/>`;
  }
  // noise dots
  for (let i = 0; i < 40; i++) {
    noise += `<circle cx="${(Math.random() * width).toFixed(1)}" cy="${(Math.random() * height).toFixed(
      1
    )}" r="1" fill="${pick(palette)}" opacity="0.4"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f5f5f4" rx="8"/>${noise}${glyphs}</svg>`;
};

export const GET: RequestHandler = async ({ cookies }) => {
  let code = randomString(6, '0123456789');
  // randomly capitalize (no-op for digits, kept for parity with validation)
  for (let i = 0; i < code.length; i++) {
    if (Math.random() > 0.5) {
      code = code.substring(0, i) + code[i].toUpperCase() + code.substring(i + 1);
    }
  }

  const rng = crypto.randomBytes(16).toString('base64');
  cookies.set('rng', rng, {
    httpOnly: true,
    maxAge: 3 * 60 * 1000,
    path: '/',
  });
  cookies.set(
    'captcha',
    jwt.sign(
      {
        h: crypto
          .createHash('sha256')
          .update(code + rng)
          .digest('base64'),
      },
      process.env.JWT_SECRET || '1',
      {
        expiresIn: '3m',
      }
    ),
    {
      httpOnly: true,
      maxAge: 3 * 60 * 1000,
      path: '/',
    }
  );

  return new Response(buildSvg(code), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
};
