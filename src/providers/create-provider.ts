import type { ShopGoodwillProviderConfig } from '../config.js';
import { DisabledShopGoodwillProvider } from './disabled.js';
import { FixtureShopGoodwillProvider } from './fixture.js';
import { AuthorizedHttpShopGoodwillProvider, type AuthorizedProviderDependencies } from './http.js';
import type { ShopGoodwillProvider } from './provider.js';

export const createShopGoodwillProvider = (
  config: ShopGoodwillProviderConfig,
  dependencies?: AuthorizedProviderDependencies,
): ShopGoodwillProvider => {
  switch (config.mode) {
    case 'disabled':
      return new DisabledShopGoodwillProvider();
    case 'fixture':
      return new FixtureShopGoodwillProvider();
    case 'authorized':
      return new AuthorizedHttpShopGoodwillProvider(config, dependencies);
  }
};
