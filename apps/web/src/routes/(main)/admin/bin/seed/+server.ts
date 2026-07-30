import { userFromToken } from '$lib/util';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Role } from '@prisma/client';
import prisma from '$lib/prisma';

// Source of the BIN reference dataset. Configurable so the deployment isn't
// pinned to whichever mirror happened to be used first; set BIN_CSV_URL to any
// CSV with the columns parsed below. Callers may also pass ?url= per request.
const DEFAULT_CSV_URL = process.env.BIN_CSV_URL ?? '';
const ROWS_PER_CALL = 80_000; // processed per HTTP request to stay well under the function timeout
const INSERT_BATCH = 5_000; // rows per createMany (keeps bind params < Postgres limit)

/** Minimal RFC-4180 CSV line splitter (handles quoted fields with embedded commas / quotes). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const clean = (v: string | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id || !user.role.includes(Role.ADMIN)) return json({ error: 'unauthorized' }, { status: 401 });

  const { offset = 0, url } = (await request.json().catch(() => ({}))) as {
    offset?: number;
    url?: string;
  };

  const csvUrl = url || DEFAULT_CSV_URL;
  if (!csvUrl) {
    return json(
      { error: 'No CSV source. Set BIN_CSV_URL or pass {"url": "..."} in the request body.' },
      { status: 400 }
    );
  }

  const res = await fetch(csvUrl);
  if (!res.ok) return json({ error: `Failed to fetch CSV (${res.status})` }, { status: 502 });
  const text = await res.text();
  // A blocked/expired file host returns its own HTML page with HTTP 200.
  if (/^\s*<(!doctype|html)/i.test(text)) {
    return json({ error: 'Source returned HTML, not CSV — check the link.' }, { status: 502 });
  }

  // Split into data rows (drop header), normalize line endings.
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const dataLines = lines.slice(1); // header row
  const total = dataLines.length;

  const slice = dataLines.slice(offset, offset + ROWS_PER_CALL);

  let inserted = 0;
  for (let i = 0; i < slice.length; i += INSERT_BATCH) {
    const batch = slice.slice(i, i + INSERT_BATCH).map((line) => {
      const f = splitCsvLine(line);
      return {
        bin: (f[0] ?? '').trim(),
        brand: clean(f[1]),
        type: clean(f[2]),
        category: clean(f[3]),
        issuer: clean(f[4]),
        issuerPhone: clean(f[5]),
        issuerUrl: clean(f[6]),
        isoCode2: clean(f[7]),
        isoCode3: clean(f[8]),
        countryName: clean(f[9]),
      };
    }).filter((r) => r.bin);

    const result = await prisma.bin.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
  }

  const nextOffset = offset + slice.length;
  const done = nextOffset >= total;

  return json({ total, processed: nextOffset, inserted, nextOffset, done });
};
