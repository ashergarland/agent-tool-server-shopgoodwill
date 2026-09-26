import { describe, expect, it } from 'vitest';
import type { SearchShopGoodwillRequest, SearchSort } from '../../src/domain/models.js';
import { FIXTURE_OBSERVED_AT, FixtureShopGoodwillProvider } from '../../src/providers/fixture.js';

const provider = new FixtureShopGoodwillProvider();
const signal = new AbortController().signal;
const search = (
  overrides: Partial<SearchShopGoodwillRequest> = {},
): Promise<Awaited<ReturnType<FixtureShopGoodwillProvider['search']>>> =>
  provider.search(
    {
      query: 'fixture',
      buyNowOnly: false,
      pickupOnly: false,
      oneCentShippingOnly: false,
      searchDescriptions: false,
      status: 'active',
      sort: 'relevance',
      page: 1,
      limit: 40,
      ...overrides,
    },
    signal,
  );

describe('synthetic fixture provider', () => {
  it('marks every response and nested record as synthetic fixture data', async () => {
    const results = await search();
    expect(results).toMatchObject({ source: 'fixture', synthetic: true });
    expect(results.notice).toMatch(/synthetic fixture data/iu);
    expect(results.listings.length).toBeGreaterThan(0);
    expect(
      results.listings.every(
        ({ source, synthetic, title }) =>
          source === 'fixture' && synthetic && title.includes('[Synthetic fixture]'),
      ),
    ).toBe(true);

    const item = await provider.getItem(990_000_001, signal);
    const shipping = await provider.estimateShipping(
      { itemId: 990_000_001, zipCode: '97201' },
      signal,
    );
    const categories = await provider.listCategories({ limit: 100 }, signal);
    const sellers = await provider.listSellers({ limit: 100 }, signal);
    expect([item, shipping, categories, sellers]).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'fixture', synthetic: true })]),
    );
    expect(categories.categories.every(({ synthetic }) => synthetic)).toBe(true);
    expect(sellers.sellers.every(({ synthetic }) => synthetic)).toBe(true);
  });

  it('supports every search filter', async () => {
    await expect(search({ query: 'camera' })).resolves.toMatchObject({ total: 1 });
    await expect(search({ query: 'untested', searchDescriptions: true })).resolves.toMatchObject({
      total: 1,
    });
    await expect(search({ sellerId: 101, query: undefined })).resolves.toMatchObject({ total: 2 });
    await expect(search({ categoryId: 21, query: undefined })).resolves.toMatchObject({ total: 1 });
    await expect(search({ minPrice: 70, maxPrice: 80 })).resolves.toMatchObject({ total: 1 });
    await expect(search({ buyNowOnly: true })).resolves.toMatchObject({ total: 2 });
    await expect(search({ pickupOnly: true })).resolves.toMatchObject({ total: 1 });
    await expect(search({ oneCentShippingOnly: true })).resolves.toMatchObject({ total: 1 });
    await expect(
      search({ status: 'closed', closedDaysBack: 5, query: undefined, sellerId: 101 }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it.each<SearchSort>([
    'relevance',
    'ending-soonest',
    'newest',
    'price-lowest',
    'price-highest',
    'most-bids',
  ])('supports the %s fixture sort', async (sort) => {
    const result = await search({ sort });
    expect(result.listings.length).toBe(3);
  });

  it('paginates once without crawling and reports a bounded result', async () => {
    const first = await search({ limit: 1, page: 1 });
    const second = await search({ limit: 1, page: 2 });
    expect(first.listings).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(second.listings).toHaveLength(1);
    expect(second.listings[0]?.itemId).not.toBe(first.listings[0]?.itemId);
  });

  it('does not represent a closed zero-bid listing as sold', async () => {
    const result = await search({
      query: 'zero-bid',
      status: 'closed',
      closedDaysBack: 30,
    });
    expect(result.listings).toEqual([
      expect.objectContaining({ bidCount: 0, sold: false, status: 'closed' }),
    ]);
    expect(result.listings[0]).not.toHaveProperty('finalPrice');
  });

  it('returns bounded rich item details and estimate semantics', async () => {
    const item = await provider.getItem(990_000_001, signal);
    expect(item).toMatchObject({
      itemId: 990_000_001,
      source: 'fixture',
      synthetic: true,
      combinedShippingEligible: true,
      currency: 'USD',
      observedAt: FIXTURE_OBSERVED_AT,
    });
    expect(item.imageUrls.length).toBeLessThanOrEqual(20);
    expect(item.bidHistory.every(({ bidderAlias }) => bidderAlias.includes('*'))).toBe(true);

    const estimate = await provider.estimateShipping(
      { itemId: 990_000_001, zipCode: '97201-1234' },
      signal,
    );
    expect(estimate).toMatchObject({
      estimate: true,
      salesTaxIncluded: false,
      combinedShippingQuote: false,
      destinationZip: '97201-1234',
    });
    expect(estimate.total).toBe(estimate.shipping + estimate.handling);
  });

  it('filters flattened categories and public seller identities', async () => {
    await expect(
      provider.listCategories({ query: 'film', limit: 1 }, signal),
    ).resolves.toMatchObject({
      categories: [
        {
          categoryId: 11,
          fullPath: 'Cameras & Camcorders > Film Cameras',
          level: 1,
        },
      ],
    });
    await expect(
      provider.listSellers({ query: 'madison', limit: 1 }, signal),
    ).resolves.toMatchObject({
      sellers: [{ sellerId: 202, landingPageName: 'synthetic-lakes' }],
    });
  });

  it('returns not-found errors and honors pre-aborted calls', async () => {
    await expect(provider.getItem(1, signal)).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      provider.estimateShipping({ itemId: 1, zipCode: '97201' }, signal),
    ).rejects.toMatchObject({ code: 'not_found' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      Promise.resolve().then(() => searchFixtureWithSignal(controller.signal)),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

const searchFixtureWithSignal = (abortedSignal: AbortSignal) =>
  provider.search(
    {
      query: 'camera',
      buyNowOnly: false,
      pickupOnly: false,
      oneCentShippingOnly: false,
      searchDescriptions: false,
      status: 'active',
      sort: 'relevance',
      page: 1,
      limit: 1,
    },
    abortedSignal,
  );
