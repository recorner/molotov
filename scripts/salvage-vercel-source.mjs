#!/usr/bin/env node
/**
 * Recover a project's source from a Vercel deployment snapshot.
 *
 * Vercel keeps the uploaded source tree for CLI deployments, which makes it the
 * last surviving copy when commits were deployed but never pushed to the git
 * remote. Walks the deployment file tree and writes every source file to disk.
 *
 * Usage: node scripts/salvage-vercel-source.mjs <deploymentId> <outDir>
 * Env:   VERCEL_TOKEN, VERCEL_TEAM_ID
 */
import fs from 'fs';
import path from 'path';

const [, , DEPLOYMENT, OUT_DIR] = process.argv;
const TOKEN = process.env.VERCEL_TOKEN;
const TEAM = process.env.VERCEL_TEAM_ID;

if (!DEPLOYMENT || !OUT_DIR || !TOKEN) {
  console.error('usage: salvage-vercel-source.mjs <deploymentId> <outDir>  (VERCEL_TOKEN required)');
  process.exit(1);
}

// Build artefacts and dependencies are reproducible; only source is worth saving.
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', '.vercel', '.git', 'dist', 'build']);

const api = async (url) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`gave up on ${url}`);
};

const q = TEAM ? `?teamId=${TEAM}` : '';
const tree = await api(`https://api.vercel.com/v6/deployments/${DEPLOYMENT}/files${q}`);

/** Flatten the tree into [{path, uid}], rooted at the "src" node Vercel wraps sources in. */
const files = [];
const walk = (nodes, prefix) => {
  for (const n of nodes || []) {
    if (n.type === 'directory') {
      if (SKIP_DIRS.has(n.name)) continue;
      walk(n.children, path.join(prefix, n.name));
    } else if (n.type === 'file' && n.uid) {
      files.push({ path: path.join(prefix, n.name), uid: n.uid });
    }
  }
};
// Vercel nests the uploaded project under a synthetic "src" root; "out" is build output.
const root = tree.find((n) => n.name === 'src') || { children: tree };
walk(root.children, '');

console.log(`${files.length} source files to recover -> ${OUT_DIR}`);

let done = 0;
let failed = 0;
const CONCURRENCY = 12;

async function fetchOne(f) {
  try {
    const body = await api(`https://api.vercel.com/v7/deployments/${DEPLOYMENT}/files/${f.uid}${q}`);
    // The endpoint returns {data: <base64>}; older deployments return raw text.
    const content =
      typeof body === 'object' && body !== null && 'data' in body
        ? Buffer.from(body.data, 'base64')
        : Buffer.from(String(body));
    const dest = path.join(OUT_DIR, f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  } catch (e) {
    failed++;
    console.error(`  ! ${f.path}: ${e.message}`);
  }
  if (++done % 50 === 0) console.log(`  ${done}/${files.length}`);
}

const queue = [...files];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await fetchOne(queue.pop());
  })
);

console.log(`\nRecovered ${files.length - failed}/${files.length} files${failed ? ` (${failed} failed)` : ''}`);
