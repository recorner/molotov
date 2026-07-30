import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/prisma';

/** Public BIN lookup — returns issuer/brand/type/country for the first 6 digits of a card. */
export const GET: RequestHandler = async ({ params }) => {
  const digits = (params.bin || '').replace(/\D/g, '');
  if (digits.length < 6) return json({ error: 'Enter at least 6 digits' }, { status: 400 });

  const bin = digits.slice(0, 6);
  const record = await prisma.bin.findUnique({ where: { bin } });

  if (!record) return json({ found: false, bin }, { status: 200 });
  return json({ found: true, ...record }, { headers: { 'cache-control': 'public, max-age=86400' } });
};
