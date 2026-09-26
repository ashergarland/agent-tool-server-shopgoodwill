import { defineTool, type AnyToolDefinition } from '@agent-tool-platform/runtime/tools';
import { z } from 'zod';
import { parseShopGoodwillItemId } from '../domain/item-id.js';
import { searchSorts, searchStatuses } from '../domain/models.js';
import type { CapabilityServices } from '../providers/provider.js';

const sourceSchema = z.enum(['fixture', 'authorized']);
const moneySchema = z.number().finite().nonnegative();
const positiveIdSchema = z.number().int().positive().safe();
const timestampSchema = z.iso.datetime({ offset: true });
const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === 'https:', {
  error: 'URL must use HTTPS',
});
const syntheticSchema = z
  .boolean()
  .describe('True only for deterministic synthetic fixture records; never current inventory.');

const commonAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const itemReferenceSchema = z.union([positiveIdSchema, z.string().trim().min(1).max(2_048)]).refine(
  (value) => {
    try {
      parseShopGoodwillItemId(value);
      return true;
    } catch {
      return false;
    }
  },
  {
    error: 'item must be a positive numeric ID or canonical https://shopgoodwill.com/item/{id} URL',
  },
);

const listingSchema = z.object({
  itemId: positiveIdSchema,
  canonicalUrl: httpsUrlSchema,
  title: z.string().min(1).max(300),
  currentPrice: moneySchema.optional(),
  finalPrice: moneySchema.optional(),
  minimumBid: moneySchema.optional(),
  bidCount: z.number().int().nonnegative().optional(),
  buyNowPrice: moneySchema.optional(),
  shippingPrice: moneySchema.optional(),
  startTime: timestampSchema.optional(),
  endTime: timestampSchema.optional(),
  remainingTime: z.string().min(1).max(300).optional(),
  categoryId: positiveIdSchema.optional(),
  categoryName: z.string().min(1).max(300).optional(),
  sellerId: positiveIdSchema.optional(),
  primaryImageUrl: httpsUrlSchema.optional(),
  pickupOnly: z.boolean().optional(),
  oneCentShipping: z.boolean().optional(),
  status: z.enum(searchStatuses),
  sold: z.boolean().optional(),
  currency: z.literal('USD'),
  country: z.literal('US'),
  source: sourceSchema,
  synthetic: syntheticSchema,
  observedAt: timestampSchema.optional(),
});

const searchInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200).optional(),
    sellerId: positiveIdSchema.optional(),
    categoryId: positiveIdSchema.optional(),
    minPrice: moneySchema.max(1_000_000).optional(),
    maxPrice: moneySchema.max(1_000_000).optional(),
    buyNowOnly: z.boolean().default(false),
    pickupOnly: z.boolean().default(false),
    oneCentShippingOnly: z.boolean().default(false),
    searchDescriptions: z.boolean().default(false),
    status: z.enum(searchStatuses).default('active'),
    closedDaysBack: z.number().int().min(1).max(90).optional(),
    sort: z.enum(searchSorts).default('ending-soonest'),
    page: z.number().int().min(1).max(100).default(1),
    limit: z.number().int().min(1).max(40).default(20),
  })
  .superRefine((input, context) => {
    if (
      input.query === undefined &&
      input.sellerId === undefined &&
      input.categoryId === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'At least one of query, sellerId, or categoryId is required',
        path: ['query'],
      });
    }
    if (
      input.minPrice !== undefined &&
      input.maxPrice !== undefined &&
      input.minPrice > input.maxPrice
    ) {
      context.addIssue({
        code: 'custom',
        message: 'minPrice must be less than or equal to maxPrice',
        path: ['minPrice'],
      });
    }
    if (input.status === 'active' && input.closedDaysBack !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'closedDaysBack is valid only when status is closed',
        path: ['closedDaysBack'],
      });
    }
  });

const searchOutputSchema = z.object({
  source: sourceSchema,
  synthetic: syntheticSchema,
  notice: z.string().min(1).max(500).optional(),
  page: z.number().int().min(1).max(100),
  limit: z.number().int().min(1).max(40),
  total: z.number().int().nonnegative().optional(),
  hasMore: z.boolean().optional(),
  listings: z.array(listingSchema).max(40),
});

export type SearchShopGoodwillInput = z.input<typeof searchInputSchema>;
export type SearchShopGoodwillOutput = z.output<typeof searchOutputSchema>;

export const searchShopGoodwillTool = defineTool({
  name: 'search_shopgoodwill',
  title: 'Search ShopGoodwill',
  summary: 'Search one bounded page of ShopGoodwill listing evidence.',
  description:
    'Search active listings, one seller inventory, or recent closed-auction evidence. Results are US/USD only, and closed listings with zero bids are never represented as sold.',
  kind: 'read',
  annotations: commonAnnotations,
  routing: {
    useWhen: [
      'you need listing discovery, inventory for a known seller ID, or bounded recent closed-auction evidence',
    ],
    doNotUseWhen: [
      'you need condition, completeness, policy, pickup, or combined-shipping details; use get_shopgoodwill_item',
      'you need to resolve a category name or seller identity; use list_shopgoodwill_categories or list_shopgoodwill_sellers',
      'you need image interpretation, eBay comparison, bid placement, purchasing, or account actions; those are outside this capability',
    ],
    nextSteps: ['get_shopgoodwill_item', 'estimate_shopgoodwill_shipping'],
    scope: 'one page, at most 40 US/USD records; no automatic pagination',
    changesState: false,
  },
  inputSchema: searchInputSchema,
  outputSchema: searchOutputSchema,
  handler(input, services: CapabilityServices, context) {
    return services.shopGoodwill.search(input, context.signal);
  },
});

const breadcrumbSchema = z.object({
  categoryId: positiveIdSchema.optional(),
  name: z.string().min(1).max(200),
});

const pickupLocationSchema = z.object({
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(40).optional(),
  zipCode: z.string().min(1).max(10).optional(),
  hours: z.string().min(1).max(1_000).optional(),
});

const publicBidSchema = z.object({
  bidderAlias: z.string().min(1).max(32),
  amount: moneySchema.optional(),
  bidTime: timestampSchema.optional(),
});

const itemOutputSchema = z.object({
  itemId: positiveIdSchema,
  canonicalUrl: httpsUrlSchema,
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(10_000).optional(),
  currentPrice: moneySchema.optional(),
  startingPrice: moneySchema.optional(),
  minimumBid: moneySchema.optional(),
  bidIncrement: moneySchema.optional(),
  bidCount: z.number().int().nonnegative().optional(),
  buyNowPrice: moneySchema.optional(),
  discountedBuyNowPrice: moneySchema.optional(),
  quantity: positiveIdSchema.optional(),
  auctionState: z.enum(['active', 'ended', 'buy-now', 'unknown']),
  reserveState: z.enum(['not-applicable', 'met', 'not-met', 'unknown']),
  ended: z.boolean(),
  startTime: timestampSchema.optional(),
  endTime: timestampSchema.optional(),
  categoryId: positiveIdSchema.optional(),
  categoryName: z.string().min(1).max(300).optional(),
  breadcrumbs: z.array(breadcrumbSchema).max(20),
  sellerName: z.string().min(1).max(300).optional(),
  sellerId: positiveIdSchema.optional(),
  sellerLandingPageName: z.string().min(1).max(300).optional(),
  defaultShippingPrice: moneySchema.optional(),
  handlingPrice: moneySchema.optional(),
  displayWeight: z.string().min(1).max(300).optional(),
  shippingCarrier: z.string().min(1).max(300).optional(),
  pickupOnly: z.boolean(),
  localPickupAvailable: z.boolean(),
  pickupLocation: pickupLocationSchema.optional(),
  combinedShippingEligible: z.boolean(),
  calculatedShippingAvailable: z.boolean(),
  internationalShipping: z.enum(['available', 'restricted', 'unavailable', 'unknown']),
  sellerPolicy: z.string().min(1).max(5_000).optional(),
  shippingPolicy: z.string().min(1).max(5_000).optional(),
  pickupPolicy: z.string().min(1).max(5_000).optional(),
  bidHistory: z.array(publicBidSchema).max(50),
  imageUrls: z.array(httpsUrlSchema).max(20),
  currency: z.literal('USD'),
  source: sourceSchema,
  synthetic: syntheticSchema,
  notice: z.string().min(1).max(500).optional(),
  observedAt: timestampSchema.optional(),
});

const itemInputSchema = z.object({ item: itemReferenceSchema });

export type GetShopGoodwillItemInput = z.input<typeof itemInputSchema>;
export type GetShopGoodwillItemOutput = z.output<typeof itemOutputSchema>;

export const getShopGoodwillItemTool = defineTool({
  name: 'get_shopgoodwill_item',
  title: 'Get ShopGoodwill item',
  summary: 'Retrieve sanitized normalized details for one ShopGoodwill listing.',
  description:
    'Retrieve public read-only details for one listing. Seller text is untrusted and sanitized; account, buyer, session, credential, cookie, and address fields are never returned.',
  kind: 'read',
  annotations: commonAnnotations,
  routing: {
    useWhen: [
      'you are evaluating listing condition, completeness, seller policy, pickup terms, or combined-shipping eligibility',
    ],
    doNotUseWhen: [
      'you are discovering listings; use search_shopgoodwill',
      'you need a delivered-price estimate; use estimate_shopgoodwill_shipping after identifying the item',
      'you need image interpretation; pass imageUrls to a separate Vision capability',
      'you need sign-in, bidding, purchasing, favorites, saved searches, or other account state changes',
    ],
    prerequisites: ['search_shopgoodwill'],
    nextSteps: ['estimate_shopgoodwill_shipping'],
    scope: 'one public listing and at most 20 image URLs and 50 masked public bid records',
    changesState: false,
  },
  inputSchema: itemInputSchema,
  outputSchema: itemOutputSchema,
  handler(input, services: CapabilityServices, context) {
    return services.shopGoodwill.getItem(parseShopGoodwillItemId(input.item), context.signal);
  },
});

const zipCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}(?:-\d{4})?$/u, 'zipCode must be a US ZIP or ZIP+4');

const shippingInputSchema = z.object({
  item: itemReferenceSchema,
  zipCode: zipCodeSchema,
});

const shippingOutputSchema = z.object({
  itemId: positiveIdSchema,
  shipping: moneySchema,
  handling: moneySchema,
  total: moneySchema,
  carrier: z.string().min(1).max(300).optional(),
  shippedFrom: z.string().min(1).max(300).optional(),
  destinationZip: zipCodeSchema,
  currency: z.literal('USD'),
  source: sourceSchema,
  synthetic: syntheticSchema,
  observedAt: timestampSchema.optional(),
  estimate: z.literal(true),
  salesTaxIncluded: z.literal(false),
  combinedShippingQuote: z.literal(false),
  notice: z.string().min(1).max(700),
});

export type EstimateShopGoodwillShippingInput = z.input<typeof shippingInputSchema>;
export type EstimateShopGoodwillShippingOutput = z.output<typeof shippingOutputSchema>;

export const estimateShopGoodwillShippingTool = defineTool({
  name: 'estimate_shopgoodwill_shipping',
  title: 'Estimate ShopGoodwill shipping',
  summary: 'Estimate quantity-one shipping and handling to one US ZIP code.',
  description:
    'Return a shipping and handling estimate for one item and US destination. It is not a checkout quote, tax calculation, or combined-shipping promise.',
  kind: 'read',
  annotations: commonAnnotations,
  routing: {
    useWhen: ['you need shipping and handling before comparing delivered prices'],
    doNotUseWhen: [
      'you need sales tax, checkout totals, or a combined-shipping quote; this tool provides none of those',
      'you have not identified a single item; use search_shopgoodwill first',
      'you need to purchase or alter account state',
    ],
    prerequisites: ['search_shopgoodwill'],
    scope: 'quantity one, one US destination, estimate only',
    changesState: false,
  },
  inputSchema: shippingInputSchema,
  outputSchema: shippingOutputSchema,
  handler(input, services: CapabilityServices, context) {
    return services.shopGoodwill.estimateShipping(
      { itemId: parseShopGoodwillItemId(input.item), zipCode: input.zipCode },
      context.signal,
    );
  },
});

const directoryInputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(100).default(100),
});

const categorySchema = z.object({
  categoryId: positiveIdSchema,
  name: z.string().min(1).max(200),
  fullPath: z.string().min(1).max(1_000),
  level: z.number().int().min(0).max(10),
  source: sourceSchema,
  synthetic: syntheticSchema,
});

const categoriesOutputSchema = z.object({
  source: sourceSchema,
  synthetic: syntheticSchema,
  notice: z.string().min(1).max(500).optional(),
  categories: z.array(categorySchema).max(100),
});

export type ListShopGoodwillCategoriesInput = z.input<typeof directoryInputSchema>;
export type ListShopGoodwillCategoriesOutput = z.output<typeof categoriesOutputSchema>;

export const listShopGoodwillCategoriesTool = defineTool({
  name: 'list_shopgoodwill_categories',
  title: 'List ShopGoodwill categories',
  summary: 'Resolve ShopGoodwill category names and paths to category IDs.',
  description: 'Return a bounded flattened public category hierarchy for later searches.',
  kind: 'read',
  annotations: commonAnnotations,
  routing: {
    useWhen: [
      'you need to resolve a category name or path into a categoryId for search_shopgoodwill',
    ],
    doNotUseWhen: [
      'you are searching inventory or retrieving item details; this directory contains no listings',
      'you need to resolve a seller identity; use list_shopgoodwill_sellers',
    ],
    nextSteps: ['search_shopgoodwill'],
    scope: 'at most 100 flattened category records',
    changesState: false,
  },
  inputSchema: directoryInputSchema,
  outputSchema: categoriesOutputSchema,
  handler(input, services: CapabilityServices, context) {
    return services.shopGoodwill.listCategories(input, context.signal);
  },
});

const sellerSchema = z.object({
  sellerId: positiveIdSchema,
  sellerName: z.string().min(1).max(200),
  organizationName: z.string().min(1).max(300).optional(),
  landingPageName: z.string().min(1).max(300).optional(),
  location: z.string().min(1).max(300).optional(),
  canonicalUrl: httpsUrlSchema.optional(),
  source: sourceSchema,
  synthetic: syntheticSchema,
});

const sellersOutputSchema = z.object({
  source: sourceSchema,
  synthetic: syntheticSchema,
  notice: z.string().min(1).max(500).optional(),
  sellers: z.array(sellerSchema).max(100),
});

export type ListShopGoodwillSellersInput = z.input<typeof directoryInputSchema>;
export type ListShopGoodwillSellersOutput = z.output<typeof sellersOutputSchema>;

export const listShopGoodwillSellersTool = defineTool({
  name: 'list_shopgoodwill_sellers',
  title: 'List ShopGoodwill sellers',
  summary: 'Resolve public seller identities to numeric ShopGoodwill seller IDs.',
  description:
    'Return a bounded seller directory using the verified buyer-compatible active-location route or an operator-configured compatible override.',
  kind: 'read',
  annotations: commonAnnotations,
  routing: {
    useWhen: [
      'you need to resolve a Goodwill organization, seller name, public location, or landing-page identity into a sellerId',
    ],
    doNotUseWhen: [
      'you already know the sellerId or need seller inventory; use search_shopgoodwill',
      'you need categories, item detail, account data, sign-in, or state changes',
    ],
    nextSteps: ['search_shopgoodwill'],
    scope: 'at most 100 public seller-directory records',
    changesState: false,
  },
  inputSchema: directoryInputSchema,
  outputSchema: sellersOutputSchema,
  handler(input, services: CapabilityServices, context) {
    return services.shopGoodwill.listSellers(input, context.signal);
  },
});

export const capabilityTools: readonly AnyToolDefinition<CapabilityServices>[] = [
  searchShopGoodwillTool,
  getShopGoodwillItemTool,
  estimateShopGoodwillShippingTool,
  listShopGoodwillCategoriesTool,
  listShopGoodwillSellersTool,
];
