import { loadCapabilityConfig } from '@agent-tool-platform/runtime/config';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_MIN_REQUEST_INTERVAL_MS,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_SELLER_DIRECTORY_PATH,
  shopGoodwillConfig,
  type ShopGoodwillConfig,
} from '../../src/config.js';
import { createShopGoodwillProvider } from '../../src/providers/create-provider.js';

const load = (source: NodeJS.ProcessEnv = {}): ShopGoodwillConfig =>
  loadCapabilityConfig({
    defaults: {
      serviceName: 'agent-tool-server-shopgoodwill',
      serviceVersion: '0.0.0-development',
    },
    spec: shopGoodwillConfig,
    source: { NODE_ENV: 'development', AUTH_MODE: 'disabled', ...source },
  });

describe('ShopGoodwill provider configuration', () => {
  it('defaults to disabled outside tests and fixture in tests', () => {
    expect(load().shopGoodwill).toEqual({
      mode: 'disabled',
      accessApproved: false,
      requestTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
      minRequestIntervalMs: DEFAULT_MIN_REQUEST_INTERVAL_MS,
      maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
      sellerDirectoryPath: DEFAULT_SELLER_DIRECTORY_PATH,
    });
    expect(load({ NODE_ENV: 'test' }).shopGoodwill.mode).toBe('fixture');
  });

  it('builds fixture and disabled providers without network configuration', () => {
    expect(createShopGoodwillProvider(load().shopGoodwill).mode).toBe('disabled');
    expect(
      createShopGoodwillProvider(load({ SHOPGOODWILL_PROVIDER_MODE: 'fixture' }).shopGoodwill).mode,
    ).toBe('fixture');
  });

  it('requires both explicit approval and a base URL in authorized mode', () => {
    expect(() =>
      load({
        SHOPGOODWILL_PROVIDER_MODE: 'authorized',
        SHOPGOODWILL_API_BASE_URL: 'https://provider.example/v1',
      }),
    ).toThrow(/SHOPGOODWILL_ACCESS_APPROVED=true/u);
    expect(() =>
      load({
        SHOPGOODWILL_PROVIDER_MODE: 'authorized',
        SHOPGOODWILL_ACCESS_APPROVED: 'true',
      }),
    ).toThrow(/SHOPGOODWILL_API_BASE_URL/u);
  });

  it('accepts an optional token and bounded authorized settings', () => {
    const config = load({
      SHOPGOODWILL_PROVIDER_MODE: 'authorized',
      SHOPGOODWILL_API_BASE_URL: 'https://provider.example/v1',
      SHOPGOODWILL_ACCESS_APPROVED: 'true',
      SHOPGOODWILL_API_TOKEN: 'test-token-that-must-never-be-returned',
      SHOPGOODWILL_REQUEST_TIMEOUT_MS: '2500',
      SHOPGOODWILL_MIN_REQUEST_INTERVAL_MS: '25',
      SHOPGOODWILL_MAX_RESPONSE_BYTES: '4096',
      SHOPGOODWILL_SELLER_DIRECTORY_PATH: 'directory/sellers',
    }).shopGoodwill;

    expect(config).toEqual({
      mode: 'authorized',
      accessApproved: true,
      apiBaseUrl: 'https://provider.example/v1/',
      apiToken: 'test-token-that-must-never-be-returned',
      requestTimeoutMs: 2500,
      minRequestIntervalMs: 25,
      maxResponseBytes: 4096,
      sellerDirectoryPath: 'directory/sellers',
    });
    expect(createShopGoodwillProvider(config).mode).toBe('authorized');
  });

  it('rejects unsafe URLs, paths, booleans, and out-of-range limits', () => {
    const authorized = {
      SHOPGOODWILL_PROVIDER_MODE: 'authorized',
      SHOPGOODWILL_ACCESS_APPROVED: 'true',
    };
    expect(() =>
      load({
        ...authorized,
        SHOPGOODWILL_API_BASE_URL: 'http://provider.example',
      }),
    ).toThrow(/must use HTTPS/u);
    expect(() =>
      load({
        ...authorized,
        SHOPGOODWILL_API_BASE_URL: 'https://user:password@provider.example',
      }),
    ).toThrow(/must not contain credentials/u);
    expect(() =>
      load({
        ...authorized,
        SHOPGOODWILL_API_BASE_URL: 'https://provider.example',
        SHOPGOODWILL_SELLER_DIRECTORY_PATH: '../sellers',
      }),
    ).toThrow(/relative path/u);
    expect(() => load({ SHOPGOODWILL_ACCESS_APPROVED: 'yes' })).toThrow(
      /Invalid capability environment configuration/u,
    );
    expect(() => load({ SHOPGOODWILL_REQUEST_TIMEOUT_MS: '99' })).toThrow(
      /SHOPGOODWILL_REQUEST_TIMEOUT_MS/u,
    );
    expect(() => load({ SHOPGOODWILL_MAX_RESPONSE_BYTES: '5000001' })).toThrow(
      /SHOPGOODWILL_MAX_RESPONSE_BYTES/u,
    );
  });

  it('allows loopback HTTP only outside production', () => {
    expect(
      load({
        SHOPGOODWILL_PROVIDER_MODE: 'authorized',
        SHOPGOODWILL_API_BASE_URL: 'http://127.0.0.1:8080/provider',
        SHOPGOODWILL_ACCESS_APPROVED: 'true',
      }).shopGoodwill.apiBaseUrl,
    ).toBe('http://127.0.0.1:8080/provider/');
  });
});
