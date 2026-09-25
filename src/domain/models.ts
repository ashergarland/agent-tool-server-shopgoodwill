export const searchStatuses = ['active', 'closed'] as const;
export type SearchStatus = (typeof searchStatuses)[number];

export const searchSorts = [
  'relevance',
  'ending-soonest',
  'newest',
  'price-lowest',
  'price-highest',
  'most-bids',
] as const;
export type SearchSort = (typeof searchSorts)[number];

export type ProviderSource = 'fixture' | 'authorized';

export interface SearchShopGoodwillRequest {
  readonly query?: string | undefined;
  readonly sellerId?: number | undefined;
  readonly categoryId?: number | undefined;
  readonly minPrice?: number | undefined;
  readonly maxPrice?: number | undefined;
  readonly buyNowOnly: boolean;
  readonly pickupOnly: boolean;
  readonly oneCentShippingOnly: boolean;
  readonly searchDescriptions: boolean;
  readonly status: SearchStatus;
  readonly closedDaysBack?: number | undefined;
  readonly sort: SearchSort;
  readonly page: number;
  readonly limit: number;
}

export interface NormalizedListing {
  readonly itemId: number;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly currentPrice?: number;
  readonly finalPrice?: number;
  readonly minimumBid?: number;
  readonly bidCount?: number;
  readonly buyNowPrice?: number;
  readonly shippingPrice?: number;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly remainingTime?: string;
  readonly categoryId?: number;
  readonly categoryName?: string;
  readonly sellerId?: number;
  readonly primaryImageUrl?: string;
  readonly pickupOnly?: boolean;
  readonly oneCentShipping?: boolean;
  readonly status: SearchStatus;
  readonly sold?: boolean;
  readonly currency: 'USD';
  readonly country: 'US';
  readonly source: ProviderSource;
  readonly synthetic: boolean;
  readonly observedAt?: string;
}

export interface SearchShopGoodwillResult {
  readonly source: ProviderSource;
  readonly synthetic: boolean;
  readonly notice?: string;
  readonly page: number;
  readonly limit: number;
  readonly total?: number;
  readonly hasMore?: boolean;
  readonly listings: NormalizedListing[];
}

export type AuctionState = 'active' | 'ended' | 'buy-now' | 'unknown';
export type ReserveState = 'not-applicable' | 'met' | 'not-met' | 'unknown';
export type InternationalShippingState = 'available' | 'restricted' | 'unavailable' | 'unknown';

export interface CategoryBreadcrumb {
  readonly categoryId?: number;
  readonly name: string;
}

export interface PublicPickupLocation {
  readonly city?: string;
  readonly state?: string;
  readonly zipCode?: string;
  readonly hours?: string;
}

export interface PublicBid {
  readonly bidderAlias: string;
  readonly amount?: number;
  readonly bidTime?: string;
}

export interface ShopGoodwillItem {
  readonly itemId: number;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly description?: string;
  readonly currentPrice?: number;
  readonly startingPrice?: number;
  readonly minimumBid?: number;
  readonly bidIncrement?: number;
  readonly bidCount?: number;
  readonly buyNowPrice?: number;
  readonly discountedBuyNowPrice?: number;
  readonly quantity?: number;
  readonly auctionState: AuctionState;
  readonly reserveState: ReserveState;
  readonly ended: boolean;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly categoryId?: number;
  readonly categoryName?: string;
  readonly breadcrumbs: CategoryBreadcrumb[];
  readonly sellerName?: string;
  readonly sellerId?: number;
  readonly sellerLandingPageName?: string;
  readonly defaultShippingPrice?: number;
  readonly handlingPrice?: number;
  readonly displayWeight?: string;
  readonly shippingCarrier?: string;
  readonly pickupOnly: boolean;
  readonly localPickupAvailable: boolean;
  readonly pickupLocation?: PublicPickupLocation;
  readonly combinedShippingEligible: boolean;
  readonly calculatedShippingAvailable: boolean;
  readonly internationalShipping: InternationalShippingState;
  readonly sellerPolicy?: string;
  readonly shippingPolicy?: string;
  readonly pickupPolicy?: string;
  readonly bidHistory: PublicBid[];
  readonly imageUrls: string[];
  readonly currency: 'USD';
  readonly source: ProviderSource;
  readonly synthetic: boolean;
  readonly notice?: string;
  readonly observedAt?: string;
}

export interface EstimateShippingRequest {
  readonly itemId: number;
  readonly zipCode: string;
}

export interface ShippingEstimate {
  readonly itemId: number;
  readonly shipping: number;
  readonly handling: number;
  readonly total: number;
  readonly carrier?: string;
  readonly shippedFrom?: string;
  readonly destinationZip: string;
  readonly currency: 'USD';
  readonly source: ProviderSource;
  readonly synthetic: boolean;
  readonly observedAt?: string;
  readonly estimate: true;
  readonly salesTaxIncluded: false;
  readonly combinedShippingQuote: false;
  readonly notice: string;
}

export interface ListDirectoryRequest {
  readonly query?: string | undefined;
  readonly limit: number;
}

export interface ShopGoodwillCategory {
  readonly categoryId: number;
  readonly name: string;
  readonly fullPath: string;
  readonly level: number;
  readonly source: ProviderSource;
  readonly synthetic: boolean;
}

export interface ShopGoodwillCategoryResult {
  readonly source: ProviderSource;
  readonly synthetic: boolean;
  readonly notice?: string;
  readonly categories: ShopGoodwillCategory[];
}

export interface ShopGoodwillSeller {
  readonly sellerId: number;
  readonly sellerName: string;
  readonly organizationName?: string;
  readonly landingPageName?: string;
  readonly location?: string;
  readonly canonicalUrl?: string;
  readonly source: ProviderSource;
  readonly synthetic: boolean;
}

export interface ShopGoodwillSellerResult {
  readonly source: ProviderSource;
  readonly synthetic: boolean;
  readonly notice?: string;
  readonly sellers: ShopGoodwillSeller[];
}
