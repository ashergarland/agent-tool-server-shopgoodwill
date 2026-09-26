import { notFound, timedOut } from '@agent-tool-platform/runtime/errors';
import { canonicalItemUrl } from '../domain/item-id.js';
import type {
  ListDirectoryRequest,
  NormalizedListing,
  SearchShopGoodwillRequest,
  SearchShopGoodwillResult,
  ShippingEstimate,
  ShopGoodwillCategory,
  ShopGoodwillCategoryResult,
  ShopGoodwillItem,
  ShopGoodwillSeller,
  ShopGoodwillSellerResult,
  EstimateShippingRequest,
} from '../domain/models.js';
import { FIXTURE_NOTICE, type ShopGoodwillProvider } from './provider.js';

export const FIXTURE_OBSERVED_AT = '2026-09-20T12:00:00.000Z';

interface FixtureListing extends NormalizedListing {
  readonly searchableDescription: string;
}

const fixtureListing = (
  listing: Omit<
    FixtureListing,
    'canonicalUrl' | 'country' | 'currency' | 'source' | 'synthetic' | 'observedAt'
  >,
): FixtureListing => ({
  ...listing,
  canonicalUrl: canonicalItemUrl(listing.itemId),
  country: 'US',
  currency: 'USD',
  source: 'fixture',
  synthetic: true,
  observedAt: FIXTURE_OBSERVED_AT,
});

const fixtureListings: readonly FixtureListing[] = [
  fixtureListing({
    itemId: 990_000_001,
    title: '[Synthetic fixture] Vintage 35mm camera kit',
    searchableDescription: 'Synthetic camera body with lens, strap, and untested light meter.',
    currentPrice: 45,
    minimumBid: 46,
    bidCount: 3,
    buyNowPrice: 120,
    shippingPrice: 12.99,
    startTime: '2026-09-18T16:00:00.000Z',
    endTime: '2026-09-23T16:00:00.000Z',
    remainingTime: '3 days 4 hours at the fixture observation time',
    categoryId: 11,
    categoryName: 'Film Cameras',
    sellerId: 101,
    primaryImageUrl: 'https://images.example.invalid/shopgoodwill-fixture/camera-1.jpg',
    pickupOnly: false,
    oneCentShipping: false,
    status: 'active',
  }),
  fixtureListing({
    itemId: 990_000_002,
    title: '[Synthetic fixture] Mechanical wristwatch',
    searchableDescription: 'Synthetic local-pickup watch with visible wear and no service history.',
    currentPrice: 75,
    minimumBid: 76,
    bidCount: 0,
    shippingPrice: 0,
    startTime: '2026-09-19T15:00:00.000Z',
    endTime: '2026-09-24T15:00:00.000Z',
    remainingTime: '4 days 3 hours at the fixture observation time',
    categoryId: 21,
    categoryName: 'Wristwatches',
    sellerId: 202,
    primaryImageUrl: 'https://images.example.invalid/shopgoodwill-fixture/watch-1.jpg',
    pickupOnly: true,
    oneCentShipping: false,
    status: 'active',
  }),
  fixtureListing({
    itemId: 990_000_003,
    title: '[Synthetic fixture] Silver-age comic book lot',
    searchableDescription: 'Synthetic twelve-issue comic lot with bags and boards.',
    currentPrice: 18.5,
    minimumBid: 19.5,
    bidCount: 5,
    buyNowPrice: 65,
    shippingPrice: 0.01,
    startTime: '2026-09-17T18:30:00.000Z',
    endTime: '2026-09-22T18:30:00.000Z',
    remainingTime: '2 days 6 hours at the fixture observation time',
    categoryId: 31,
    categoryName: 'Comic Books',
    sellerId: 101,
    primaryImageUrl: 'https://images.example.invalid/shopgoodwill-fixture/comics-1.jpg',
    pickupOnly: false,
    oneCentShipping: true,
    status: 'active',
  }),
  fixtureListing({
    itemId: 990_000_004,
    title: '[Synthetic fixture] Closed zero-bid camera listing',
    searchableDescription: 'Synthetic closed listing retained only as no-sale market evidence.',
    minimumBid: 29.99,
    bidCount: 0,
    shippingPrice: 10,
    startTime: '2026-09-12T17:00:00.000Z',
    endTime: '2026-09-17T17:00:00.000Z',
    categoryId: 11,
    categoryName: 'Film Cameras',
    sellerId: 101,
    primaryImageUrl: 'https://images.example.invalid/shopgoodwill-fixture/camera-closed.jpg',
    pickupOnly: false,
    oneCentShipping: false,
    status: 'closed',
    sold: false,
  }),
  fixtureListing({
    itemId: 990_000_005,
    title: '[Synthetic fixture] Closed acoustic guitar auction',
    searchableDescription: 'Synthetic closed guitar listing with a provider-confirmed sale.',
    finalPrice: 210,
    minimumBid: 200,
    bidCount: 7,
    shippingPrice: 34.5,
    startTime: '2026-09-10T20:00:00.000Z',
    endTime: '2026-09-15T20:00:00.000Z',
    categoryId: 41,
    categoryName: 'Acoustic Guitars',
    sellerId: 303,
    primaryImageUrl: 'https://images.example.invalid/shopgoodwill-fixture/guitar-closed.jpg',
    pickupOnly: false,
    oneCentShipping: false,
    status: 'closed',
    sold: true,
  }),
  fixtureListing({
    itemId: 990_000_006,
    title: '[Synthetic fixture] Closed reserve-not-met laptop',
    searchableDescription: 'Synthetic closed laptop auction; bids did not establish a sale.',
    finalPrice: 150,
    minimumBid: 155,
    bidCount: 2,
    shippingPrice: 22,
    startTime: '2026-09-08T14:00:00.000Z',
    endTime: '2026-09-13T14:00:00.000Z',
    categoryId: 51,
    categoryName: 'Laptop Computers',
    sellerId: 202,
    primaryImageUrl: 'https://images.example.invalid/shopgoodwill-fixture/laptop-closed.jpg',
    pickupOnly: false,
    oneCentShipping: false,
    status: 'closed',
    sold: false,
  }),
];

const fixtureCategories: readonly ShopGoodwillCategory[] = [
  {
    categoryId: 10,
    name: 'Cameras & Camcorders',
    fullPath: 'Cameras & Camcorders',
    level: 0,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 11,
    name: 'Film Cameras',
    fullPath: 'Cameras & Camcorders > Film Cameras',
    level: 1,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 20,
    name: 'Jewelry & Watches',
    fullPath: 'Jewelry & Watches',
    level: 0,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 21,
    name: 'Wristwatches',
    fullPath: 'Jewelry & Watches > Wristwatches',
    level: 1,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 30,
    name: 'Books & Media',
    fullPath: 'Books & Media',
    level: 0,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 31,
    name: 'Comic Books',
    fullPath: 'Books & Media > Comic Books',
    level: 1,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 40,
    name: 'Musical Instruments',
    fullPath: 'Musical Instruments',
    level: 0,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 41,
    name: 'Acoustic Guitars',
    fullPath: 'Musical Instruments > Acoustic Guitars',
    level: 1,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 50,
    name: 'Computers & Electronics',
    fullPath: 'Computers & Electronics',
    level: 0,
    source: 'fixture',
    synthetic: true,
  },
  {
    categoryId: 51,
    name: 'Laptop Computers',
    fullPath: 'Computers & Electronics > Laptop Computers',
    level: 1,
    source: 'fixture',
    synthetic: true,
  },
];

const fixtureSellers: readonly ShopGoodwillSeller[] = [
  {
    sellerId: 101,
    sellerName: 'Synthetic Northwest Goodwill',
    organizationName: 'Synthetic Goodwill Organization A',
    landingPageName: 'synthetic-northwest',
    location: 'Portland, OR (synthetic fixture)',
    source: 'fixture',
    synthetic: true,
  },
  {
    sellerId: 202,
    sellerName: 'Synthetic Lakes Goodwill',
    organizationName: 'Synthetic Goodwill Organization B',
    landingPageName: 'synthetic-lakes',
    location: 'Madison, WI (synthetic fixture)',
    source: 'fixture',
    synthetic: true,
  },
  {
    sellerId: 303,
    sellerName: 'Synthetic Coastal Goodwill',
    organizationName: 'Synthetic Goodwill Organization C',
    landingPageName: 'synthetic-coastal',
    location: 'Savannah, GA (synthetic fixture)',
    source: 'fixture',
    synthetic: true,
  },
];

const assertNotAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw timedOut('The ShopGoodwill fixture request was cancelled');
};

const effectivePrice = (listing: FixtureListing): number =>
  listing.currentPrice ?? listing.finalPrice ?? listing.minimumBid ?? Number.POSITIVE_INFINITY;

const compareOptionalDate = (left: string | undefined, right: string | undefined): number =>
  (left === undefined ? Number.POSITIVE_INFINITY : Date.parse(left)) -
  (right === undefined ? Number.POSITIVE_INFINITY : Date.parse(right));

const createFixtureItem = (listing: FixtureListing): ShopGoodwillItem => {
  const ended = listing.status === 'closed';
  const seller = fixtureSellers.find(({ sellerId }) => sellerId === listing.sellerId);
  return {
    itemId: listing.itemId,
    canonicalUrl: listing.canonicalUrl,
    title: listing.title,
    description:
      `${listing.searchableDescription}\n` +
      'This is synthetic fixture content and does not describe current inventory.',
    ...(listing.currentPrice === undefined ? {} : { currentPrice: listing.currentPrice }),
    ...(listing.minimumBid === undefined ? {} : { startingPrice: listing.minimumBid }),
    ...(listing.minimumBid === undefined ? {} : { minimumBid: listing.minimumBid }),
    bidIncrement: 1,
    ...(listing.bidCount === undefined ? {} : { bidCount: listing.bidCount }),
    ...(listing.buyNowPrice === undefined ? {} : { buyNowPrice: listing.buyNowPrice }),
    quantity: 1,
    auctionState: ended ? 'ended' : 'active',
    reserveState: listing.itemId === 990_000_006 ? 'not-met' : 'not-applicable',
    ended,
    ...(listing.startTime === undefined ? {} : { startTime: listing.startTime }),
    ...(listing.endTime === undefined ? {} : { endTime: listing.endTime }),
    ...(listing.categoryId === undefined ? {} : { categoryId: listing.categoryId }),
    ...(listing.categoryName === undefined ? {} : { categoryName: listing.categoryName }),
    breadcrumbs: [
      ...(listing.categoryName === undefined
        ? []
        : [
            {
              ...(listing.categoryId === undefined ? {} : { categoryId: listing.categoryId }),
              name: listing.categoryName,
            },
          ]),
    ],
    ...(seller?.sellerName === undefined ? {} : { sellerName: seller.sellerName }),
    ...(listing.sellerId === undefined ? {} : { sellerId: listing.sellerId }),
    ...(seller?.landingPageName === undefined
      ? {}
      : { sellerLandingPageName: seller.landingPageName }),
    ...(listing.shippingPrice === undefined ? {} : { defaultShippingPrice: listing.shippingPrice }),
    handlingPrice: 3.5,
    displayWeight: '4 lb (synthetic fixture)',
    shippingCarrier: 'Synthetic Ground',
    pickupOnly: listing.pickupOnly ?? false,
    localPickupAvailable: listing.sellerId === 202,
    ...(listing.sellerId === 202
      ? {
          pickupLocation: {
            city: 'Madison',
            state: 'WI',
            zipCode: '53703',
            hours: 'Synthetic fixture: Tue-Thu 10:00-14:00',
          },
        }
      : {}),
    combinedShippingEligible: listing.sellerId === 101,
    calculatedShippingAvailable: !(listing.pickupOnly ?? false),
    internationalShipping: 'unavailable',
    sellerPolicy:
      'Synthetic fixture seller policy. Verify all live terms on the authorized listing source.',
    shippingPolicy:
      'Synthetic fixture shipping policy. Estimates are not checkout or combined-shipping quotes.',
    pickupPolicy:
      'Synthetic fixture pickup policy. Bring no assumptions from this fixture to a live purchase.',
    bidHistory:
      listing.bidCount === undefined || listing.bidCount === 0
        ? []
        : [
            {
              bidderAlias: 'f***e',
              ...((listing.currentPrice ?? listing.finalPrice) === undefined
                ? {}
                : { amount: listing.currentPrice ?? listing.finalPrice }),
              ...(listing.endTime === undefined ? {} : { bidTime: listing.endTime }),
            },
          ],
    imageUrls:
      listing.primaryImageUrl === undefined
        ? []
        : [listing.primaryImageUrl, listing.primaryImageUrl.replace('.jpg', '-detail.jpg')],
    currency: 'USD',
    source: 'fixture',
    synthetic: true,
    notice: FIXTURE_NOTICE,
    observedAt: FIXTURE_OBSERVED_AT,
  };
};

export class FixtureShopGoodwillProvider implements ShopGoodwillProvider {
  public readonly mode = 'fixture' as const;

  public search(
    input: SearchShopGoodwillRequest,
    signal: AbortSignal,
  ): Promise<SearchShopGoodwillResult> {
    assertNotAborted(signal);
    const query = input.query?.toLocaleLowerCase('en-US');
    const closedCutoff =
      input.closedDaysBack === undefined
        ? undefined
        : Date.parse(FIXTURE_OBSERVED_AT) - input.closedDaysBack * 86_400_000;

    const matches = fixtureListings.filter((listing) => {
      if (listing.status !== input.status) return false;
      if (input.sellerId !== undefined && listing.sellerId !== input.sellerId) return false;
      if (input.categoryId !== undefined && listing.categoryId !== input.categoryId) return false;
      const price = effectivePrice(listing);
      if (input.minPrice !== undefined && price < input.minPrice) return false;
      if (input.maxPrice !== undefined && price > input.maxPrice) return false;
      if (input.buyNowOnly && listing.buyNowPrice === undefined) return false;
      if (input.pickupOnly && listing.pickupOnly !== true) return false;
      if (input.oneCentShippingOnly && listing.oneCentShipping !== true) return false;
      if (
        closedCutoff !== undefined &&
        (listing.endTime === undefined || Date.parse(listing.endTime) < closedCutoff)
      ) {
        return false;
      }
      if (query === undefined) return true;
      const searchable = input.searchDescriptions
        ? `${listing.title} ${listing.searchableDescription}`
        : listing.title;
      return searchable.toLocaleLowerCase('en-US').includes(query);
    });

    const sorted = [...matches];
    switch (input.sort) {
      case 'ending-soonest':
        sorted.sort((left, right) => compareOptionalDate(left.endTime, right.endTime));
        break;
      case 'newest':
        sorted.sort((left, right) => compareOptionalDate(right.startTime, left.startTime));
        break;
      case 'price-lowest':
        sorted.sort((left, right) => effectivePrice(left) - effectivePrice(right));
        break;
      case 'price-highest':
        sorted.sort((left, right) => effectivePrice(right) - effectivePrice(left));
        break;
      case 'most-bids':
        sorted.sort((left, right) => (right.bidCount ?? 0) - (left.bidCount ?? 0));
        break;
      case 'relevance':
        break;
    }

    const start = (input.page - 1) * input.limit;
    const listings = sorted.slice(start, start + input.limit).map((fixture) => {
      const { searchableDescription, ...listing } = fixture;
      void searchableDescription;
      return listing;
    });
    return Promise.resolve({
      source: 'fixture',
      synthetic: true,
      notice: FIXTURE_NOTICE,
      page: input.page,
      limit: input.limit,
      total: sorted.length,
      hasMore: start + listings.length < sorted.length,
      listings,
    });
  }

  public getItem(itemId: number, signal: AbortSignal): Promise<ShopGoodwillItem> {
    assertNotAborted(signal);
    const listing = fixtureListings.find((candidate) => candidate.itemId === itemId);
    if (!listing) {
      return Promise.reject(
        notFound('Synthetic ShopGoodwill fixture item was not found', {
          itemId,
          source: 'fixture',
        }),
      );
    }
    return Promise.resolve(createFixtureItem(listing));
  }

  public estimateShipping(
    input: EstimateShippingRequest,
    signal: AbortSignal,
  ): Promise<ShippingEstimate> {
    assertNotAborted(signal);
    const listing = fixtureListings.find((candidate) => candidate.itemId === input.itemId);
    if (!listing) {
      return Promise.reject(
        notFound('Synthetic ShopGoodwill fixture item was not found', {
          itemId: input.itemId,
          source: 'fixture',
        }),
      );
    }
    const shipping = listing.pickupOnly ? 0 : (listing.shippingPrice ?? 9.99);
    const handling = listing.pickupOnly ? 0 : 3.5;
    const shippedFrom = fixtureSellers.find(
      ({ sellerId }) => sellerId === listing.sellerId,
    )?.location;
    return Promise.resolve({
      itemId: input.itemId,
      shipping,
      handling,
      total: shipping + handling,
      carrier: listing.pickupOnly ? 'Local pickup only' : 'Synthetic Ground',
      ...(shippedFrom === undefined ? {} : { shippedFrom }),
      destinationZip: input.zipCode,
      currency: 'USD',
      source: 'fixture',
      synthetic: true,
      observedAt: FIXTURE_OBSERVED_AT,
      estimate: true,
      salesTaxIncluded: false,
      combinedShippingQuote: false,
      notice:
        `${FIXTURE_NOTICE} This is a quantity-one shipping estimate, not a checkout, tax, ` +
        'or combined-shipping quote.',
    });
  }

  public listCategories(
    input: ListDirectoryRequest,
    signal: AbortSignal,
  ): Promise<ShopGoodwillCategoryResult> {
    assertNotAborted(signal);
    const query = input.query?.toLocaleLowerCase('en-US');
    const categories = fixtureCategories
      .filter(
        ({ name, fullPath }) =>
          query === undefined ||
          name.toLocaleLowerCase('en-US').includes(query) ||
          fullPath.toLocaleLowerCase('en-US').includes(query),
      )
      .slice(0, input.limit);
    return Promise.resolve({
      source: 'fixture',
      synthetic: true,
      notice: FIXTURE_NOTICE,
      categories,
    });
  }

  public listSellers(
    input: ListDirectoryRequest,
    signal: AbortSignal,
  ): Promise<ShopGoodwillSellerResult> {
    assertNotAborted(signal);
    const query = input.query?.toLocaleLowerCase('en-US');
    const sellers = fixtureSellers
      .filter(
        ({ sellerName, organizationName, landingPageName, location }) =>
          query === undefined ||
          [sellerName, organizationName, landingPageName, location].some((value) =>
            value?.toLocaleLowerCase('en-US').includes(query),
          ),
      )
      .slice(0, input.limit);
    return Promise.resolve({
      source: 'fixture',
      synthetic: true,
      notice: FIXTURE_NOTICE,
      sellers,
    });
  }
}
