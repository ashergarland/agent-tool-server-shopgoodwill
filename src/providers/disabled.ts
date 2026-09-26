import { notReady } from '@agent-tool-platform/runtime/errors';
import type {
  SearchShopGoodwillResult,
  ShippingEstimate,
  ShopGoodwillCategoryResult,
  ShopGoodwillItem,
  ShopGoodwillSellerResult,
} from '../domain/models.js';
import type { ShopGoodwillProvider } from './provider.js';

const providerDisabled = (): Error =>
  notReady('ShopGoodwill provider access is disabled', {
    reason: 'provider_disabled',
    requiredMode: 'fixture or authorized',
  });

export class DisabledShopGoodwillProvider implements ShopGoodwillProvider {
  public readonly mode = 'disabled' as const;

  public search(): Promise<SearchShopGoodwillResult> {
    return Promise.reject(providerDisabled());
  }

  public getItem(): Promise<ShopGoodwillItem> {
    return Promise.reject(providerDisabled());
  }

  public estimateShipping(): Promise<ShippingEstimate> {
    return Promise.reject(providerDisabled());
  }

  public listCategories(): Promise<ShopGoodwillCategoryResult> {
    return Promise.reject(providerDisabled());
  }

  public listSellers(): Promise<ShopGoodwillSellerResult> {
    return Promise.reject(providerDisabled());
  }
}
