import { upstreamError } from '@agent-tool-platform/runtime/errors';
import { canonicalItemUrl } from '../domain/item-id.js';
import type {
  AuctionState,
  CategoryBreadcrumb,
  InternationalShippingState,
  ListDirectoryRequest,
  NormalizedListing,
  PublicBid,
  PublicPickupLocation,
  ReserveState,
  SearchShopGoodwillRequest,
  SearchShopGoodwillResult,
  ShippingEstimate,
  ShopGoodwillCategory,
  ShopGoodwillCategoryResult,
  ShopGoodwillItem,
  ShopGoodwillSeller,
  ShopGoodwillSellerResult,
} from '../domain/models.js';
import { sanitizeSingleLine, sanitizeUntrustedText } from '../domain/sanitize.js';

type UnknownRecord = Record<string, unknown>;

const MAX_UPSTREAM_ARRAY_LENGTH = 1_000;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_POLICY_LENGTH = 5_000;
const MAX_IMAGES = 20;
const MAX_BID_HISTORY = 50;
const MAX_BREADCRUMBS = 20;
const MAX_CATEGORY_DEPTH = 10;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const schemaDrift = (operation: string): Error =>
  upstreamError('ShopGoodwill provider returned an unsupported response shape', {
    reason: 'schema_drift',
    operation,
  });

const findValue = (record: UnknownRecord, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (Object.hasOwn(record, key)) return record[key];
  }
  return undefined;
};

const readRecord = (record: UnknownRecord, keys: readonly string[]): UnknownRecord | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) return value;
  }
  return undefined;
};

const readArray = (
  record: UnknownRecord,
  keys: readonly string[],
): readonly unknown[] | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    if (value.length > MAX_UPSTREAM_ARRAY_LENGTH) throw schemaDrift('array-bounds');
    return Array.from<unknown>(value);
  }
  return undefined;
};

const readString = (
  record: UnknownRecord,
  keys: readonly string[],
  maxLength: number,
): string | undefined => {
  for (const key of keys) {
    const value = sanitizeSingleLine(record[key], maxLength);
    if (value !== undefined) return value;
  }
  return undefined;
};

const readText = (
  record: UnknownRecord,
  keys: readonly string[],
  maxLength: number,
): string | undefined => {
  for (const key of keys) {
    const value = sanitizeUntrustedText(record[key], maxLength);
    if (value !== undefined) return value;
  }
  return undefined;
};

const parseFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = sanitizeSingleLine(value, 100);
  if (normalized === undefined || normalized === '') return undefined;
  const numeric = Number(normalized.replaceAll(',', ''));
  return Number.isFinite(numeric) ? numeric : undefined;
};

const readNonnegativeMoney = (
  record: UnknownRecord,
  keys: readonly string[],
): number | undefined => {
  for (const key of keys) {
    const value = record[key];
    const direct = parseFiniteNumber(value);
    if (direct !== undefined) {
      if (direct >= 0) return Math.round(direct * 100) / 100;
      continue;
    }
    if (typeof value !== 'string') continue;
    const text = sanitizeSingleLine(value, 200);
    const match =
      text === undefined ? undefined : /(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/iu.exec(text);
    if (match?.[1] === undefined) continue;
    const parsed = Number(match[1].replaceAll(',', ''));
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed * 100) / 100;
  }
  return undefined;
};

const readPositiveInteger = (
  record: UnknownRecord,
  keys: readonly string[],
): number | undefined => {
  for (const key of keys) {
    const value = parseFiniteNumber(record[key]);
    if (value !== undefined && Number.isSafeInteger(value) && value > 0) return value;
  }
  return undefined;
};

const readNonnegativeInteger = (
  record: UnknownRecord,
  keys: readonly string[],
): number | undefined => {
  for (const key of keys) {
    const value = parseFiniteNumber(record[key]);
    if (value !== undefined && Number.isSafeInteger(value) && value >= 0) return value;
  }
  return undefined;
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'True') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'False') return false;
  return undefined;
};

const readBoolean = (record: UnknownRecord, keys: readonly string[]): boolean | undefined => {
  for (const key of keys) {
    const value = parseBoolean(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

const parseIsoDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

const readDate = (record: UnknownRecord, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = parseIsoDate(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

const readCurrency = (record: UnknownRecord): 'USD' => {
  const currency = readString(record, ['currency', 'Currency', 'currencyCode', 'CurrencyCode'], 8);
  if (currency !== undefined && currency.toUpperCase() !== 'USD') {
    throw upstreamError('ShopGoodwill provider returned a non-USD record', {
      reason: 'unsupported_currency',
    });
  }
  return 'USD';
};

const assertUsRecord = (record: UnknownRecord): void => {
  const country = readString(record, ['country', 'Country', 'countryCode', 'CountryCode'], 40);
  if (
    country !== undefined &&
    country.toUpperCase() !== 'US' &&
    country.toUpperCase() !== 'USA' &&
    country.toUpperCase() !== 'UNITED STATES'
  ) {
    throw upstreamError('ShopGoodwill provider returned a non-US record', {
      reason: 'unsupported_country',
    });
  }
};

const normalizeHttpsUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== ''
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
};

const normalizeShopGoodwillUrl = (value: unknown): string | undefined => {
  const normalized = normalizeHttpsUrl(value);
  if (normalized === undefined) return undefined;
  const url = new URL(normalized);
  return url.hostname.toLowerCase() === 'shopgoodwill.com' ||
    url.hostname.toLowerCase() === 'www.shopgoodwill.com'
    ? url.href
    : undefined;
};

const rootRecord = (payload: unknown): UnknownRecord => {
  if (!isRecord(payload)) throw schemaDrift('root');
  for (const key of ['data', 'Data', 'result', 'Result', 'model', 'Model']) {
    const nested = payload[key];
    if (isRecord(nested)) return nested;
  }
  return payload;
};

const rootArray = (
  payload: unknown,
  aliases: readonly string[],
  operation: string,
): readonly unknown[] => {
  if (Array.isArray(payload)) {
    if (payload.length > MAX_UPSTREAM_ARRAY_LENGTH) throw schemaDrift(operation);
    return payload;
  }
  const root = rootRecord(payload);
  const direct = readArray(root, aliases);
  if (direct !== undefined) return direct;
  for (const wrapper of ['data', 'Data', 'result', 'Result', 'searchResults', 'SearchResults']) {
    const nested = root[wrapper];
    if (Array.isArray(nested)) {
      if (nested.length > MAX_UPSTREAM_ARRAY_LENGTH) throw schemaDrift(operation);
      return nested;
    }
    if (isRecord(nested)) {
      const array = readArray(nested, aliases);
      if (array !== undefined) return array;
    }
  }
  throw schemaDrift(operation);
};

const normalizeListing = (
  value: unknown,
  request: SearchShopGoodwillRequest,
): NormalizedListing => {
  if (!isRecord(value)) throw schemaDrift('search-listing');
  readCurrency(value);
  assertUsRecord(value);
  const itemId = readPositiveInteger(value, ['itemId', 'ItemId', 'itemID', 'ItemID', 'id', 'Id']);
  const title = readString(value, ['title', 'Title', 'itemTitle', 'ItemTitle'], 300);
  if (itemId === undefined || title === undefined) throw schemaDrift('search-listing');

  const bidCount = readNonnegativeInteger(value, [
    'bidCount',
    'BidCount',
    'numBids',
    'NumBids',
    'numberOfBids',
    'NumberOfBids',
  ]);
  const upstreamPrice = readNonnegativeMoney(value, [
    'currentPrice',
    'CurrentPrice',
    'price',
    'Price',
    'finalPrice',
    'FinalPrice',
  ]);
  const explicitSold = readBoolean(value, ['sold', 'Sold', 'isSold', 'IsSold']);
  const sold = request.status === 'closed' && bidCount === 0 ? false : explicitSold;
  const imageValue = findValue(value, [
    'primaryImageUrl',
    'PrimaryImageUrl',
    'imageUrl',
    'ImageUrl',
    'imageURL',
    'image',
    'Image',
  ]);
  const imageRecord = isRecord(imageValue) ? imageValue : undefined;
  const primaryImageUrl = normalizeHttpsUrl(
    imageRecord === undefined
      ? imageValue
      : findValue(imageRecord, ['url', 'Url', 'imageUrl', 'ImageUrl']),
  );

  return {
    itemId,
    canonicalUrl: canonicalItemUrl(itemId),
    title,
    ...(request.status === 'active' && upstreamPrice !== undefined
      ? { currentPrice: upstreamPrice }
      : {}),
    ...(request.status === 'closed' && bidCount !== 0 && upstreamPrice !== undefined
      ? { finalPrice: upstreamPrice }
      : {}),
    ...optionalMoney(value, 'minimumBid', ['minimumBid', 'MinimumBid', 'nextBid', 'NextBid']),
    ...(bidCount === undefined ? {} : { bidCount }),
    ...optionalMoney(value, 'buyNowPrice', [
      'buyNowPrice',
      'BuyNowPrice',
      'buyItNowPrice',
      'BuyItNowPrice',
    ]),
    ...optionalMoney(value, 'shippingPrice', [
      'shippingPrice',
      'ShippingPrice',
      'defaultShippingPrice',
      'DefaultShippingPrice',
    ]),
    ...optionalDate(value, 'startTime', ['startTime', 'StartTime', 'startDate', 'StartDate']),
    ...optionalDate(value, 'endTime', ['endTime', 'EndTime', 'endDate', 'EndDate']),
    ...optionalString(value, 'remainingTime', [
      'remainingTime',
      'RemainingTime',
      'timeRemaining',
      'TimeRemaining',
    ]),
    ...optionalPositiveInteger(value, 'categoryId', ['categoryId', 'CategoryId']),
    ...optionalString(value, 'categoryName', [
      'categoryName',
      'CategoryName',
      'category',
      'Category',
      'catFullName',
    ]),
    ...optionalPositiveInteger(value, 'sellerId', ['sellerId', 'SellerId']),
    ...(primaryImageUrl === undefined ? {} : { primaryImageUrl }),
    ...optionalBoolean(value, 'pickupOnly', ['pickupOnly', 'PickupOnly', 'isPickupOnly']),
    ...optionalBoolean(value, 'oneCentShipping', [
      'oneCentShipping',
      'OneCentShipping',
      'isOneCentShipping',
    ]),
    status: request.status,
    ...(sold === undefined ? {} : { sold }),
    currency: 'USD',
    country: 'US',
    source: 'authorized',
    synthetic: false,
    ...optionalDate(value, 'observedAt', [
      'observedAt',
      'ObservedAt',
      'providerTimestamp',
      'ProviderTimestamp',
    ]),
  };
};

const optionalString = <K extends string>(
  record: UnknownRecord,
  property: K,
  keys: readonly string[],
  maxLength = 300,
): Partial<Record<K, string>> => {
  const value = readString(record, keys, maxLength);
  return value === undefined ? {} : ({ [property]: value } as Record<K, string>);
};

const optionalMoney = <K extends string>(
  record: UnknownRecord,
  property: K,
  keys: readonly string[],
): Partial<Record<K, number>> => {
  const value = readNonnegativeMoney(record, keys);
  return value === undefined ? {} : ({ [property]: value } as Record<K, number>);
};

const optionalPositiveInteger = <K extends string>(
  record: UnknownRecord,
  property: K,
  keys: readonly string[],
): Partial<Record<K, number>> => {
  const value = readPositiveInteger(record, keys);
  return value === undefined ? {} : ({ [property]: value } as Record<K, number>);
};

const optionalNonnegativeInteger = <K extends string>(
  record: UnknownRecord,
  property: K,
  keys: readonly string[],
): Partial<Record<K, number>> => {
  const value = readNonnegativeInteger(record, keys);
  return value === undefined ? {} : ({ [property]: value } as Record<K, number>);
};

const optionalBoolean = <K extends string>(
  record: UnknownRecord,
  property: K,
  keys: readonly string[],
): Partial<Record<K, boolean>> => {
  const value = readBoolean(record, keys);
  return value === undefined ? {} : ({ [property]: value } as Record<K, boolean>);
};

const optionalDate = <K extends string>(
  record: UnknownRecord,
  property: K,
  keys: readonly string[],
): Partial<Record<K, string>> => {
  const value = readDate(record, keys);
  return value === undefined ? {} : ({ [property]: value } as Record<K, string>);
};

export const normalizeSearchResponse = (
  payload: unknown,
  request: SearchShopGoodwillRequest,
): SearchShopGoodwillResult => {
  const records = rootArray(
    payload,
    ['items', 'Items', 'listings', 'Listings', 'results', 'Results', 'itemListings'],
    'search',
  );
  const root = isRecord(payload) ? rootRecord(payload) : undefined;
  const searchResults =
    root === undefined ? undefined : readRecord(root, ['searchResults', 'SearchResults']);
  const listings = records
    .slice(0, request.limit)
    .map((record) => normalizeListing(record, request));
  const total =
    root === undefined
      ? undefined
      : ((searchResults === undefined
          ? undefined
          : readNonnegativeInteger(searchResults, ['itemCount', 'ItemCount', 'total', 'Total'])) ??
        readNonnegativeInteger(root, [
          'total',
          'Total',
          'totalCount',
          'TotalCount',
          'totalItems',
          'TotalItems',
        ]));
  const hasMore =
    root === undefined
      ? undefined
      : (readBoolean(root, ['hasMore', 'HasMore', 'hasNextPage', 'HasNextPage']) ??
        (total === undefined ? undefined : request.page * request.limit < total));
  return {
    source: 'authorized',
    synthetic: false,
    page: request.page,
    limit: request.limit,
    ...(total === undefined ? {} : { total }),
    ...(hasMore === undefined ? {} : { hasMore }),
    listings,
  };
};

const normalizedAuctionState = (record: UnknownRecord, ended: boolean): AuctionState => {
  const value = readString(record, ['auctionState', 'AuctionState', 'itemState', 'ItemState'], 40)
    ?.toLowerCase()
    .replaceAll('_', '-');
  if (value === 'active' || value === 'ended' || value === 'buy-now') return value;
  return ended ? 'ended' : 'unknown';
};

const normalizedReserveState = (record: UnknownRecord): ReserveState => {
  const value = readString(record, ['reserveState', 'ReserveState', 'reserveStatus'], 40)
    ?.toLowerCase()
    .replaceAll('_', '-');
  if (value === 'not-applicable' || value === 'met' || value === 'not-met' || value === 'unknown') {
    return value;
  }
  const hasReserve = readBoolean(record, ['hasReserve', 'HasReserve']);
  const reserveMet = readBoolean(record, ['reserveMet', 'ReserveMet', 'isReserveMet']);
  if (hasReserve === false) return 'not-applicable';
  if (reserveMet === true) return 'met';
  if (reserveMet === false) return 'not-met';
  return 'unknown';
};

const normalizedInternationalShipping = (record: UnknownRecord): InternationalShippingState => {
  const value = readString(
    record,
    ['internationalShipping', 'InternationalShipping', 'internationalShippingStatus'],
    40,
  )?.toLowerCase();
  if (
    value === 'available' ||
    value === 'restricted' ||
    value === 'unavailable' ||
    value === 'unknown'
  ) {
    return value;
  }
  const available = readBoolean(record, [
    'internationalShippingAvailable',
    'InternationalShippingAvailable',
    'allowInternationalShipping',
  ]);
  return available === true ? 'available' : available === false ? 'unavailable' : 'unknown';
};

const normalizeBreadcrumbs = (record: UnknownRecord): CategoryBreadcrumb[] => {
  const values = readArray(record, [
    'breadcrumbs',
    'Breadcrumbs',
    'categoryBreadcrumbs',
    'CategoryBreadcrumbs',
    'categoryParentList',
    'CategoryParentList',
  ]);
  if (values === undefined) return [];
  const result: CategoryBreadcrumb[] = [];
  for (const value of values.slice(0, MAX_BREADCRUMBS)) {
    if (!isRecord(value)) continue;
    const name = readString(value, ['name', 'Name', 'categoryName', 'CategoryName'], 200);
    if (name === undefined) continue;
    const categoryId = readPositiveInteger(value, ['categoryId', 'CategoryId', 'id', 'Id']);
    result.push({ ...(categoryId === undefined ? {} : { categoryId }), name });
  }
  return result;
};

const maskBidderAlias = (value: unknown): string | undefined => {
  const alias = sanitizeSingleLine(value, 32);
  if (alias === undefined) return undefined;
  if (alias.includes('*')) return alias;
  const characters = Array.from(alias);
  if (characters.length <= 1) return '***';
  return `${characters[0]}***${characters.at(-1)}`;
};

const normalizeBidHistory = (record: UnknownRecord): PublicBid[] => {
  const values = readArray(record, ['bidHistory', 'BidHistory', 'bids', 'Bids']);
  if (values === undefined) return [];
  const result: PublicBid[] = [];
  for (const value of values.slice(0, MAX_BID_HISTORY)) {
    if (!isRecord(value)) continue;
    const bidderAlias = maskBidderAlias(
      findValue(value, ['bidderAlias', 'BidderAlias', 'bidder', 'Bidder', 'userName']),
    );
    if (bidderAlias === undefined) continue;
    const amount = readNonnegativeMoney(value, ['amount', 'Amount', 'bidAmount', 'BidAmount']);
    const bidTime = readDate(value, ['bidTime', 'BidTime', 'date', 'Date']);
    result.push({
      bidderAlias,
      ...(amount === undefined ? {} : { amount }),
      ...(bidTime === undefined ? {} : { bidTime }),
    });
  }
  return result;
};

const normalizeImageUrls = (record: UnknownRecord): string[] => {
  const values = readArray(record, ['imageUrls', 'ImageUrls', 'images', 'Images', 'itemImages']);
  const imageServer = readString(record, ['imageServer', 'ImageServer'], 2_048);
  const imageUrlString = readString(
    record,
    ['imageUrlString', 'ImageUrlString', 'imageURLString'],
    20_000,
  );
  const candidates =
    values ??
    imageUrlString
      ?.split(';')
      .map((value) => value.trim())
      .filter((value) => value.length > 0) ??
    [];
  const urls = candidates
    .slice(0, MAX_IMAGES * 2)
    .map((value) => {
      const raw = isRecord(value)
        ? findValue(value, [
            'url',
            'Url',
            'imageUrl',
            'ImageUrl',
            'imageURL',
            'largeUrl',
            'LargeUrl',
          ])
        : value;
      const direct = normalizeHttpsUrl(raw);
      if (direct !== undefined || typeof raw !== 'string' || imageServer === undefined)
        return direct;
      try {
        return normalizeHttpsUrl(new URL(raw.replaceAll('\\', '/'), imageServer).href);
      } catch {
        return undefined;
      }
    })
    .filter((value): value is string => value !== undefined);
  return [...new Set(urls)].slice(0, MAX_IMAGES);
};

const normalizePickupLocation = (record: UnknownRecord): PublicPickupLocation | undefined => {
  const location = readRecord(record, [
    'pickupLocation',
    'PickupLocation',
    'publicPickupLocation',
    'PublicPickupLocation',
  ]);
  const source = location ?? record;
  const city = readString(source, ['city', 'City', 'pickupCity', 'PickupCity'], 100);
  const state = readString(source, ['state', 'State', 'pickupState', 'PickupState'], 40);
  const zipCode = readString(source, ['zipCode', 'ZipCode', 'pickupZip', 'PickupZip'], 10);
  const hours = readText(source, ['hours', 'Hours', 'pickupHours', 'PickupHours'], 1_000);
  if ([city, state, zipCode, hours].every((value) => value === undefined)) return undefined;
  return {
    ...(city === undefined ? {} : { city }),
    ...(state === undefined ? {} : { state }),
    ...(zipCode === undefined ? {} : { zipCode }),
    ...(hours === undefined ? {} : { hours }),
  };
};

export const normalizeItemResponse = (
  payload: unknown,
  expectedItemId: number,
): ShopGoodwillItem => {
  const record = rootRecord(payload);
  readCurrency(record);
  assertUsRecord(record);
  const itemId =
    readPositiveInteger(record, ['itemId', 'ItemId', 'itemID', 'ItemID', 'id', 'Id']) ??
    expectedItemId;
  if (itemId !== expectedItemId) throw schemaDrift('item-id');
  const title = readString(record, ['title', 'Title', 'itemTitle', 'ItemTitle'], 300);
  if (title === undefined) throw schemaDrift('item-title');
  const ended =
    readBoolean(record, ['ended', 'Ended', 'isEnded', 'IsEnded', 'auctionEnded']) ??
    (readDate(record, ['endTime', 'EndTime', 'endDate', 'EndDate']) !== undefined &&
      Date.parse(readDate(record, ['endTime', 'EndTime', 'endDate', 'EndDate']) ?? '') <=
        Date.now());
  const pickupOnly =
    readBoolean(record, ['pickupOnly', 'PickupOnly', 'isPickupOnly', 'IsPickupOnly']) ?? false;
  const localPickupAvailable =
    readBoolean(record, [
      'localPickupAvailable',
      'LocalPickupAvailable',
      'allowLocalPickup',
      'AllowLocalPickup',
    ]) ?? pickupOnly;
  const combinedShippingEligible =
    readBoolean(record, [
      'combinedShippingEligible',
      'CombinedShippingEligible',
      'allowCombinedShipping',
      'AllowCombinedShipping',
    ]) ?? false;
  const calculatedShippingAvailable =
    readBoolean(record, [
      'calculatedShippingAvailable',
      'CalculatedShippingAvailable',
      'allowCalculatedShipping',
      'AllowCalculatedShipping',
    ]) ?? false;
  const description = readText(
    record,
    ['description', 'Description', 'itemDescription'],
    MAX_DESCRIPTION_LENGTH,
  );
  const sellerPolicy = readText(
    record,
    ['sellerPolicy', 'SellerPolicy', 'sellerPolicies', 'SellerPolicies'],
    MAX_POLICY_LENGTH,
  );
  const shippingPolicy = readText(
    record,
    ['shippingPolicy', 'ShippingPolicy', 'shippingPolicies', 'ShippingPolicies'],
    MAX_POLICY_LENGTH,
  );
  const pickupPolicy = readText(
    record,
    ['pickupPolicy', 'PickupPolicy', 'pickupPolicies', 'PickupPolicies'],
    MAX_POLICY_LENGTH,
  );
  const pickupLocation = normalizePickupLocation(record);

  return {
    itemId,
    canonicalUrl: canonicalItemUrl(itemId),
    title,
    ...(description === undefined ? {} : { description }),
    ...optionalMoney(record, 'currentPrice', ['currentPrice', 'CurrentPrice', 'price', 'Price']),
    ...optionalMoney(record, 'startingPrice', ['startingPrice', 'StartingPrice', 'startPrice']),
    ...optionalMoney(record, 'minimumBid', ['minimumBid', 'MinimumBid', 'nextBid', 'NextBid']),
    ...optionalMoney(record, 'bidIncrement', ['bidIncrement', 'BidIncrement']),
    ...optionalNonnegativeInteger(record, 'bidCount', [
      'bidCount',
      'BidCount',
      'numBids',
      'NumBids',
      'numberOfBids',
    ]),
    ...optionalMoney(record, 'buyNowPrice', ['buyNowPrice', 'BuyNowPrice', 'buyItNowPrice']),
    ...optionalMoney(record, 'discountedBuyNowPrice', [
      'discountedBuyNowPrice',
      'DiscountedBuyNowPrice',
      'discountBuyNowPrice',
    ]),
    ...optionalPositiveInteger(record, 'quantity', ['quantity', 'Quantity']),
    auctionState: normalizedAuctionState(record, ended),
    reserveState: normalizedReserveState(record),
    ended,
    ...optionalDate(record, 'startTime', ['startTime', 'StartTime', 'startDate', 'StartDate']),
    ...optionalDate(record, 'endTime', ['endTime', 'EndTime', 'endDate', 'EndDate']),
    ...optionalPositiveInteger(record, 'categoryId', ['categoryId', 'CategoryId']),
    ...optionalString(record, 'categoryName', ['categoryName', 'CategoryName', 'category']),
    breadcrumbs: normalizeBreadcrumbs(record),
    ...optionalString(record, 'sellerName', ['sellerName', 'SellerName', 'seller']),
    ...optionalPositiveInteger(record, 'sellerId', ['sellerId', 'SellerId']),
    ...optionalString(record, 'sellerLandingPageName', [
      'sellerLandingPageName',
      'SellerLandingPageName',
      'landingPageName',
    ]),
    ...optionalMoney(record, 'defaultShippingPrice', [
      'defaultShippingPrice',
      'DefaultShippingPrice',
      'shippingPrice',
    ]),
    ...optionalMoney(record, 'handlingPrice', ['handlingPrice', 'HandlingPrice', 'handlingFee']),
    ...optionalString(record, 'displayWeight', [
      'displayWeight',
      'DisplayWeight',
      'shippingWeight',
    ]),
    ...optionalString(record, 'shippingCarrier', ['shippingCarrier', 'ShippingCarrier', 'carrier']),
    pickupOnly,
    localPickupAvailable,
    ...(pickupLocation === undefined ? {} : { pickupLocation }),
    combinedShippingEligible,
    calculatedShippingAvailable,
    internationalShipping: normalizedInternationalShipping(record),
    ...(sellerPolicy === undefined ? {} : { sellerPolicy }),
    ...(shippingPolicy === undefined ? {} : { shippingPolicy }),
    ...(pickupPolicy === undefined ? {} : { pickupPolicy }),
    bidHistory: normalizeBidHistory(record),
    imageUrls: normalizeImageUrls(record),
    currency: 'USD',
    source: 'authorized',
    synthetic: false,
    ...optionalDate(record, 'observedAt', [
      'observedAt',
      'ObservedAt',
      'providerTimestamp',
      'ProviderTimestamp',
    ]),
  };
};

export const normalizeShippingResponse = (
  payload: unknown,
  itemId: number,
  destinationZip: string,
): ShippingEstimate => {
  if (typeof payload === 'string') {
    const text = sanitizeUntrustedText(payload, 5_000);
    if (text === undefined) throw schemaDrift('shipping-html');
    if (text.includes('RATE.LOCATION.NOSERVICE')) {
      throw upstreamError('Shipping is unavailable for the requested destination', {
        reason: 'shipping_unavailable',
      });
    }
    const lines = text.split('\n');
    const labeled = (label: string): string | undefined => {
      const prefix = `${label.toLowerCase()}:`;
      const line = lines.find((candidate) => candidate.toLowerCase().startsWith(prefix));
      return line?.slice(line.indexOf(':') + 1).trim();
    };
    const shippingText = labeled('Shipping');
    const handlingText = labeled('Handling');
    const totalText = labeled('Total Shipping and Handling');
    const shipping =
      shippingText === undefined
        ? undefined
        : readNonnegativeMoney({ value: shippingText }, ['value']);
    const handling =
      handlingText === undefined
        ? 0
        : (readNonnegativeMoney({ value: handlingText }, ['value']) ?? 0);
    if (shipping === undefined) throw schemaDrift('shipping-html-price');
    const total =
      (totalText === undefined
        ? undefined
        : readNonnegativeMoney({ value: totalText }, ['value'])) ??
      Math.round((shipping + handling) * 100) / 100;
    const carrier = labeled('Shipping Carrier');
    const shippedFrom = labeled('Shipped From');
    return {
      itemId,
      shipping,
      handling,
      total,
      ...(carrier === undefined ? {} : { carrier }),
      ...(shippedFrom === undefined ? {} : { shippedFrom }),
      destinationZip,
      currency: 'USD',
      source: 'authorized',
      synthetic: false,
      estimate: true,
      salesTaxIncluded: false,
      combinedShippingQuote: false,
      notice:
        'Quantity-one shipping and handling estimate only; this is not a checkout, sales-tax, or combined-shipping quote.',
    };
  }

  const record = rootRecord(payload);
  readCurrency(record);
  assertUsRecord(record);
  const responseItemId = readPositiveInteger(record, ['itemId', 'ItemId']);
  if (responseItemId !== undefined && responseItemId !== itemId)
    throw schemaDrift('shipping-item-id');
  const shipping = readNonnegativeMoney(record, [
    'shipping',
    'Shipping',
    'shippingPrice',
    'ShippingPrice',
    'shippingCost',
    'ShippingCost',
  ]);
  const handling =
    readNonnegativeMoney(record, [
      'handling',
      'Handling',
      'handlingPrice',
      'HandlingPrice',
      'handlingCost',
      'HandlingCost',
    ]) ?? 0;
  if (shipping === undefined) throw schemaDrift('shipping-price');
  const total =
    readNonnegativeMoney(record, ['total', 'Total', 'totalPrice', 'TotalPrice']) ??
    Math.round((shipping + handling) * 100) / 100;
  return {
    itemId,
    shipping,
    handling,
    total,
    ...optionalString(record, 'carrier', [
      'carrier',
      'Carrier',
      'shippingCarrier',
      'ShippingCarrier',
    ]),
    ...optionalString(record, 'shippedFrom', [
      'shippedFrom',
      'ShippedFrom',
      'origin',
      'Origin',
      'sellerLocation',
    ]),
    destinationZip,
    currency: 'USD',
    source: 'authorized',
    synthetic: false,
    ...optionalDate(record, 'observedAt', [
      'observedAt',
      'ObservedAt',
      'providerTimestamp',
      'ProviderTimestamp',
    ]),
    estimate: true,
    salesTaxIncluded: false,
    combinedShippingQuote: false,
    notice:
      'Quantity-one shipping and handling estimate only; this is not a checkout, sales-tax, or combined-shipping quote.',
  };
};

const flattenCategories = (
  values: readonly unknown[],
  request: ListDirectoryRequest,
): ShopGoodwillCategory[] => {
  const matches: ShopGoodwillCategory[] = [];
  let visited = 0;
  const query = request.query?.toLocaleLowerCase('en-US');

  const visit = (value: unknown, parents: readonly string[], level: number): void => {
    visited += 1;
    if (visited > MAX_UPSTREAM_ARRAY_LENGTH || level > MAX_CATEGORY_DEPTH) {
      throw schemaDrift('category-bounds');
    }
    if (!isRecord(value)) throw schemaDrift('category');
    const categoryId = readPositiveInteger(value, [
      'categoryId',
      'CategoryId',
      'mappedCatId',
      'MappedCatId',
      'id',
      'Id',
    ]);
    const name = readString(
      value,
      ['name', 'Name', 'categoryName', 'CategoryName', 'shortName', 'ShortName'],
      200,
    );
    if (categoryId === undefined || name === undefined) throw schemaDrift('category');
    const pathParts = [...parents, name];
    const fullPath = pathParts.join(' > ');
    if (
      query === undefined ||
      name.toLocaleLowerCase('en-US').includes(query) ||
      fullPath.toLocaleLowerCase('en-US').includes(query)
    ) {
      matches.push({
        categoryId,
        name,
        fullPath,
        level,
        source: 'authorized',
        synthetic: false,
      });
    }
    const children = readArray(value, [
      'children',
      'Children',
      'subcategories',
      'Subcategories',
      'categoryList',
      'childCategories',
      'ChildCategories',
    ]);
    if (children !== undefined) {
      for (const child of children) visit(child, pathParts, level + 1);
    }
  };

  for (const value of values) visit(value, [], 0);
  return matches.slice(0, request.limit);
};

export const normalizeCategoriesResponse = (
  payload: unknown,
  request: ListDirectoryRequest,
): ShopGoodwillCategoryResult => {
  const records = rootArray(
    payload,
    ['categories', 'Categories', 'categoryList', 'CategoryList', 'items', 'Items'],
    'categories',
  );
  return {
    source: 'authorized',
    synthetic: false,
    categories: flattenCategories(records, request),
  };
};

const normalizeSeller = (value: unknown): ShopGoodwillSeller => {
  if (!isRecord(value)) throw schemaDrift('seller');
  const sellerId = readPositiveInteger(value, ['sellerId', 'SellerId', 'id', 'Id']);
  const sellerName = readString(
    value,
    ['sellerName', 'SellerName', 'name', 'Name', 'searchFilterName'],
    200,
  );
  if (sellerId === undefined || sellerName === undefined) throw schemaDrift('seller');
  const canonicalUrl = normalizeShopGoodwillUrl(
    findValue(value, ['canonicalUrl', 'CanonicalUrl', 'sellerUrl', 'SellerUrl', 'url', 'Url']),
  );
  return {
    sellerId,
    sellerName,
    ...optionalString(value, 'organizationName', [
      'organizationName',
      'OrganizationName',
      'goodwillName',
      'GoodwillName',
      'searchFilterNameLong',
      'SearchFilterNameLong',
    ]),
    ...optionalString(value, 'landingPageName', [
      'landingPageName',
      'LandingPageName',
      'landingPageSlug',
      'LandingPageSlug',
    ]),
    ...optionalString(value, 'location', [
      'location',
      'Location',
      'locationSummary',
      'LocationSummary',
      'cityState',
      'pickupCity',
      'PickupCity',
    ]),
    ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
    source: 'authorized',
    synthetic: false,
  };
};

export const normalizeSellersResponse = (
  payload: unknown,
  request: ListDirectoryRequest,
): ShopGoodwillSellerResult => {
  const records = rootArray(
    payload,
    ['sellers', 'Sellers', 'sellerList', 'SellerList', 'items', 'Items'],
    'sellers',
  );
  const query = request.query?.toLocaleLowerCase('en-US');
  const sellers = records
    .map(normalizeSeller)
    .filter(
      ({ sellerName, organizationName, landingPageName, location }) =>
        query === undefined ||
        [sellerName, organizationName, landingPageName, location].some((value) =>
          value?.toLocaleLowerCase('en-US').includes(query),
        ),
    )
    .slice(0, request.limit);
  return { source: 'authorized', synthetic: false, sellers };
};
