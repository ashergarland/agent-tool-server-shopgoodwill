import { badRequest } from '@agent-tool-platform/runtime/errors';
import type {
  EstimateShippingRequest,
  ListDirectoryRequest,
  SearchShopGoodwillRequest,
  SearchShopGoodwillResult,
  ShippingEstimate,
  ShopGoodwillCategoryResult,
  ShopGoodwillItem,
  ShopGoodwillSellerResult,
} from '../domain/models.js';

export const FIXTURE_NOTICE =
  'Synthetic fixture data for integration testing only; it is not current ShopGoodwill inventory.';

export const unsupportedProviderFeature = (feature: string): Error =>
  badRequest(`The configured authorized provider does not support ${feature}`, {
    reason: 'unsupported_provider_feature',
    feature,
  });

export interface ShopGoodwillProvider {
  readonly mode: 'disabled' | 'fixture' | 'authorized';
  search(input: SearchShopGoodwillRequest, signal: AbortSignal): Promise<SearchShopGoodwillResult>;
  getItem(itemId: number, signal: AbortSignal): Promise<ShopGoodwillItem>;
  estimateShipping(input: EstimateShippingRequest, signal: AbortSignal): Promise<ShippingEstimate>;
  listCategories(
    input: ListDirectoryRequest,
    signal: AbortSignal,
  ): Promise<ShopGoodwillCategoryResult>;
  listSellers(input: ListDirectoryRequest, signal: AbortSignal): Promise<ShopGoodwillSellerResult>;
}

export interface CapabilityServices {
  readonly shopGoodwill: ShopGoodwillProvider;
}
