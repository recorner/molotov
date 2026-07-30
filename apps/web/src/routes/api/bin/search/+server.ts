import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/prisma';

const PER_PAGE = 24;

type Facets = { countries: { name: string; count: number }[]; brands: { name: string; count: number }[]; types: { name: string; count: number }[] };
let facetCache: { at: number; data: Facets } | null = null;
const FACET_TTL = 10 * 60 * 1000;

async function getFacets(now: number): Promise<Facets> {
  if (facetCache && now - facetCache.at < FACET_TTL) return facetCache.data;
  const [countries, brands, types] = await Promise.all([
    prisma.bin.groupBy({ by: ['countryName'], _count: { _all: true } }),
    prisma.bin.groupBy({ by: ['brand'], _count: { _all: true } }),
    prisma.bin.groupBy({ by: ['type'], _count: { _all: true } }),
  ]);
  const shape = (rows: any[], key: string) =>
    rows.filter((r) => r[key]).map((r) => ({ name: r[key] as string, count: r._count._all })).sort((a, b) => b.count - a.count);
  const data: Facets = { countries: shape(countries, 'countryName'), brands: shape(brands, 'brand'), types: shape(types, 'type') };
  facetCache = { at: now, data };
  return data;
}

export const GET: RequestHandler = async ({ url }) => {
  const binsRaw = url.searchParams.get('bins') || '';
  const bank = (url.searchParams.get('bank') || '').trim();
  const country = url.searchParams.get('country') || '';
  const brand = url.searchParams.get('brand') || '';
  const type = url.searchParams.get('type') || '';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const wantFacets = url.searchParams.get('facets') === '1';

  const binList = Array.from(
    new Set(
      binsRaw.split(/[\s,;]+/).map((t) => t.replace(/\D/g, '')).filter((t) => t.length >= 6).map((t) => t.slice(0, 6))
    )
  ).slice(0, 500);

  const hasQuery = binList.length > 0 || !!bank || !!country || !!brand || !!type;

  const where: any = {};
  if (binList.length) where.bin = { in: binList };
  if (bank) where.issuer = { contains: bank, mode: 'insensitive' };
  if (country) where.countryName = country;
  if (brand) where.brand = brand;
  if (type) where.type = type;

  let results: any[] = [];
  let total = 0;
  if (hasQuery) {
    [results, total] = await Promise.all([
      prisma.bin.findMany({ where, orderBy: { bin: 'asc' }, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
      prisma.bin.count({ where }),
    ]);
  }

  const payload: any = {
    results,
    total,
    page,
    perPage: PER_PAGE,
    totalPages: Math.ceil(total / PER_PAGE) || 1,
  };
  if (wantFacets) payload.facets = await getFacets(Date.now());

  return json(payload);
};
