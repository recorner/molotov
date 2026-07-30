import type { PageServerLoad } from './$types';
import { Role } from '@prisma/client';
import prisma from '$lib/prisma';

const PER_PAGE = 50;

// Facets (distinct countries / brands / types) are effectively static — cache them
// in module memory so we don't full-scan the 375k-row table on every search.
type Facets = { countries: { name: string; count: number }[]; brands: { name: string; count: number }[]; types: { name: string; count: number }[] };
let facetCache: { at: number; data: Facets } | null = null;
const FACET_TTL = 10 * 60 * 1000;

async function getFacets(): Promise<Facets> {
  if (facetCache && Date.now() - facetCache.at < FACET_TTL) return facetCache.data;

  const [countries, brands, types] = await Promise.all([
    prisma.bin.groupBy({ by: ['countryName'], _count: { _all: true } }),
    prisma.bin.groupBy({ by: ['brand'], _count: { _all: true } }),
    prisma.bin.groupBy({ by: ['type'], _count: { _all: true } }),
  ]);

  const shape = (rows: any[], key: string) =>
    rows
      .filter((r) => r[key])
      .map((r) => ({ name: r[key] as string, count: r._count._all }))
      .sort((a, b) => b.count - a.count);

  const data: Facets = {
    countries: shape(countries, 'countryName'),
    brands: shape(brands, 'brand'),
    types: shape(types, 'type'),
  };
  facetCache = { at: Date.now(), data };
  return data;
}

export const load: PageServerLoad = async ({ parent, url }) => {
  const { user } = await parent();

  const binsRaw = url.searchParams.get('bins') || '';
  const bank = (url.searchParams.get('bank') || '').trim();
  const country = url.searchParams.get('country') || '';
  const brand = url.searchParams.get('brand') || '';
  const type = url.searchParams.get('type') || '';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

  // Parse a list of BINs (comma / space / newline separated), normalize to 6 digits.
  const binList = Array.from(
    new Set(
      binsRaw
        .split(/[\s,;]+/)
        .map((t) => t.replace(/\D/g, ''))
        .filter((t) => t.length >= 6)
        .map((t) => t.slice(0, 6))
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
  let totalCount = 0;

  if (hasQuery) {
    [results, totalCount] = await Promise.all([
      prisma.bin.findMany({
        where,
        orderBy: { bin: 'asc' },
        take: PER_PAGE,
        skip: (page - 1) * PER_PAGE,
      }),
      prisma.bin.count({ where }),
    ]);
  }

  const [facets, total] = await Promise.all([getFacets(), prisma.bin.count()]);

  return {
    facets,
    total,
    isAdmin: !!user?.role?.includes(Role.ADMIN),
    filters: { bins: binsRaw, bank, country, brand, type, page },
    binList,
    hasQuery,
    results,
    pagination: {
      page,
      totalCount,
      totalPages: Math.ceil(totalCount / PER_PAGE) || 1,
      hasPrev: page > 1,
      hasNext: page * PER_PAGE < totalCount,
    },
  };
};
