import { ConfigurationError, type PlatformConfig } from '@agent-tool-platform/runtime/config';
import { defineCapabilityConfig } from '@agent-tool-platform/runtime/config';
import { z } from 'zod';

export const providerModes = ['disabled', 'fixture', 'authorized'] as const;
export type ProviderMode = (typeof providerModes)[number];

export const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
export const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
export const DEFAULT_SELLER_DIRECTORY_PATH = 'Search/GetActiveLocation';

const providerPathSchema = z
  .string()
  .max(256)
  .refine(
    (value) =>
      value.length > 0 &&
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.includes('?') &&
      !value.includes('#') &&
      !value.split('/').includes('..'),
    'must be a relative path without a query, fragment, backslash, or parent segment',
  );

const approvalBoolean = z.union([z.boolean(), z.string()]).transform((value, context) => {
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  context.addIssue({ code: 'custom', message: 'Expected true or false' });
  return z.NEVER;
});

export const shopGoodwillEnvSchema = z.object({
  SHOPGOODWILL_PROVIDER_MODE: z.enum(providerModes).optional(),
  SHOPGOODWILL_API_BASE_URL: z.url().max(2_048).optional(),
  SHOPGOODWILL_ACCESS_APPROVED: approvalBoolean.optional(),
  SHOPGOODWILL_API_TOKEN: z.string().min(1).max(4_096).optional(),
  SHOPGOODWILL_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(DEFAULT_PROVIDER_TIMEOUT_MS),
  SHOPGOODWILL_MIN_REQUEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(60_000)
    .default(DEFAULT_MIN_REQUEST_INTERVAL_MS),
  SHOPGOODWILL_MAX_RESPONSE_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(5_000_000)
    .default(DEFAULT_MAX_RESPONSE_BYTES),
  SHOPGOODWILL_SELLER_DIRECTORY_PATH: providerPathSchema.optional(),
});

type ShopGoodwillEnv = z.infer<typeof shopGoodwillEnvSchema>;

export interface ShopGoodwillProviderConfig {
  readonly mode: ProviderMode;
  readonly accessApproved: boolean;
  readonly apiBaseUrl?: string;
  readonly apiToken?: string;
  readonly requestTimeoutMs: number;
  readonly minRequestIntervalMs: number;
  readonly maxResponseBytes: number;
  readonly sellerDirectoryPath?: string;
}

export interface ShopGoodwillConfig extends PlatformConfig {
  readonly shopGoodwill: ShopGoodwillProviderConfig;
}

const normalizeBaseUrl = (value: string): string => {
  const url = new URL(value);
  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return url.href;
};

const isLoopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

const validateAuthorizedBaseUrl = (value: string, config: PlatformConfig): void => {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigurationError(
      'SHOPGOODWILL_API_BASE_URL must not contain credentials, a query, or a fragment',
    );
  }
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && !config.isProduction && isLoopbackHost(url.hostname)) return;
  throw new ConfigurationError(
    'SHOPGOODWILL_API_BASE_URL must use HTTPS (loopback HTTP is allowed outside production)',
  );
};

export const shopGoodwillConfig = defineCapabilityConfig({
  schema: shopGoodwillEnvSchema,

  build({
    base,
    env,
  }: {
    readonly base: PlatformConfig;
    readonly env: ShopGoodwillEnv;
  }): ShopGoodwillConfig {
    const mode = env.SHOPGOODWILL_PROVIDER_MODE ?? (base.env === 'test' ? 'fixture' : 'disabled');
    const apiBaseUrl = env.SHOPGOODWILL_API_BASE_URL;
    const apiToken = env.SHOPGOODWILL_API_TOKEN;
    const sellerDirectoryPath =
      env.SHOPGOODWILL_SELLER_DIRECTORY_PATH ?? DEFAULT_SELLER_DIRECTORY_PATH;

    return {
      ...base,
      shopGoodwill: {
        mode,
        accessApproved: env.SHOPGOODWILL_ACCESS_APPROVED ?? false,
        ...(apiBaseUrl === undefined ? {} : { apiBaseUrl: normalizeBaseUrl(apiBaseUrl) }),
        ...(apiToken === undefined ? {} : { apiToken }),
        requestTimeoutMs: env.SHOPGOODWILL_REQUEST_TIMEOUT_MS,
        minRequestIntervalMs: env.SHOPGOODWILL_MIN_REQUEST_INTERVAL_MS,
        maxResponseBytes: env.SHOPGOODWILL_MAX_RESPONSE_BYTES,
        sellerDirectoryPath,
      },
    };
  },

  validate(config: ShopGoodwillConfig): void {
    const provider = config.shopGoodwill;
    if (provider.mode !== 'authorized') return;
    if (!provider.accessApproved) {
      throw new ConfigurationError(
        'SHOPGOODWILL_ACCESS_APPROVED=true is required in authorized provider mode',
      );
    }
    if (!provider.apiBaseUrl) {
      throw new ConfigurationError(
        'SHOPGOODWILL_API_BASE_URL is required in authorized provider mode',
      );
    }
    validateAuthorizedBaseUrl(provider.apiBaseUrl, config);
  },
});
