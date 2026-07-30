// Generate all favicon / app-icon sizes for Sereni.
//
// Source priority:
//   1. static/brand-source.png  (drop a licensed, un-watermarked brand image here)
//   2. src/lib/logo.svg         (the built-in Sereni ripple mark — default)
//
// Usage:  node scripts/make-favicons.mjs
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = join(root, 'static');
const sourcePng = join(staticDir, 'brand-source.png');
const logoSvg = join(root, 'src', 'lib', 'logo.svg');

const getSource = async () => {
  if (existsSync(sourcePng)) {
    console.log('Using static/brand-source.png as source');
    return await readFile(sourcePng);
  }
  console.log('Using src/lib/logo.svg as source');
  return await readFile(logoSvg);
};

const targets = [
  { name: 'favicon.png', size: 64 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

const src = await getSource();

for (const { name, size } of targets) {
  await sharp(src, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(join(staticDir, name));
  console.log(`  ✓ ${name} (${size}x${size})`);
}

console.log('Done.');
