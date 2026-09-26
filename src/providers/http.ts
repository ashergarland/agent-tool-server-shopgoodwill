import type { ReadableStreamDefaultReader } from 'node:stream/web';
import { linkSignals } from '@agent-tool-platform/runtime/cancellation';
import {
  AppError,
  notFound,
  rateLimited,
  timedOut,
  upstreamError,
} from '@agent-tool-platform/runtime/errors';
import type { ShopGoodwillProviderConfig } from '../config.js';
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
import {
  normalizeCategoriesResponse,
  normalizeItemResponse,
  normalizeSearchResponse,
  normalizeSellersResponse,
  normalizeShippingResponse,
} from './normalize.js';
import { unsupportedProviderFeature, type ShopGoodwillProvider } from './provider.js';

export interface AuthorizedProviderDependencies {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

const authorizedSortMappings = {
  'ending-soonest': { sortColumn: '1', sortDescending: 'false' },
  newest: { sortColumn: '1', sortDescending: 'true' },
  'price-lowest': { sortColumn: '4', sortDescending: 'false' },
  'price-highest': { sortColumn: '4', sortDescending: 'true' },
  'most-bids': { sortColumn: '3', sortDescending: 'true' },
} as const;

const cancelledError = (): Error =>
  timedOut('The ShopGoodwill provider request timed out or was cancelled');

const waitFor = (milliseconds: number, signal: AbortSignal): Promise<void> => {
  if (milliseconds <= 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(cancelledError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(cancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
};

class SerializedRateGate {
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAt = Number.NEGATIVE_INFINITY;

  public constructor(
    private readonly minimumIntervalMs: number,
    private readonly now: () => number,
  ) {}

  public async run<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      if (signal.aborted) throw cancelledError();
      const delay = Math.max(0, this.lastStartedAt + this.minimumIntervalMs - this.now());
      await waitFor(delay, signal);
      if (signal.aborted) throw cancelledError();
      this.lastStartedAt = this.now();
      return await operation();
    } finally {
      release();
    }
  }
}

const concatenate = (chunks: readonly Uint8Array[], length: number): Uint8Array => {
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const readBoundedJson = async (response: Response, maximumBytes: number): Promise<unknown> => {
  const contentType = response.headers.get('content-type')?.toLowerCase();
  if (
    contentType === undefined ||
    (!contentType.includes('application/json') && !contentType.includes('+json'))
  ) {
    throw upstreamError('ShopGoodwill provider returned a non-JSON response', {
      reason: 'invalid_content_type',
    });
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      throw upstreamError('ShopGoodwill provider returned an invalid response length', {
        reason: 'invalid_content_length',
      });
    }
    if (declaredBytes > maximumBytes) {
      throw upstreamError('ShopGoodwill provider response exceeded the configured size limit', {
        reason: 'response_too_large',
        maximumBytes,
      });
    }
  }

  if (response.body === null) {
    throw upstreamError('ShopGoodwill provider returned an empty response', {
      reason: 'invalid_json',
    });
  }

  const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel('response size limit exceeded');
      throw upstreamError('ShopGoodwill provider response exceeded the configured size limit', {
        reason: 'response_too_large',
        maximumBytes,
      });
    }
    chunks.push(value);
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(concatenate(chunks, length));
  } catch (error) {
    throw new AppError(
      'upstream_error',
      'ShopGoodwill provider returned invalid UTF-8 JSON',
      { reason: 'invalid_json' },
      true,
      error,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new AppError(
      'upstream_error',
      'ShopGoodwill provider returned invalid JSON',
      { reason: 'invalid_json' },
      true,
      error,
    );
  }
};

export const buildSearchRequestBody = (
  request: SearchShopGoodwillRequest,
  now = new Date(),
): Readonly<Record<string, unknown>> => {
  const mapping = request.sort === 'relevance' ? undefined : authorizedSortMappings[request.sort];
  if (mapping === undefined) throw unsupportedProviderFeature('search sort "relevance"');
  const boolString = (value: boolean): string => (value ? 'true' : 'false');
  return {
    isSize: false,
    isWeddingCatagory: 'false',
    isMultipleCategoryIds: false,
    isFromHeaderMenuTab: false,
    layout: '',
    isFromHomePage: false,
    searchText: request.query ?? '',
    selectedGroup: 'Keyword',
    selectedCategoryIds: request.categoryId === undefined ? '' : String(request.categoryId),
    selectedSellerIds: request.sellerId === undefined ? '' : String(request.sellerId),
    lowPrice: String(request.minPrice ?? 0),
    highPrice: String(request.maxPrice ?? 999_999),
    searchBuyNowOnly: request.buyNowOnly ? 'true' : '',
    searchPickupOnly: boolString(request.pickupOnly),
    searchNoPickupOnly: 'false',
    searchOneCentShippingOnly: boolString(request.oneCentShippingOnly),
    searchDescriptions: boolString(request.searchDescriptions),
    searchClosedAuctions: boolString(request.status === 'closed'),
    closedAuctionEndingDate: `${String(now.getUTCMonth() + 1)}/${String(
      now.getUTCDate(),
    )}/${String(now.getUTCFullYear())}`,
    closedAuctionDaysBack: String(request.closedDaysBack ?? 7),
    searchCanadaShipping: 'false',
    searchInternationalShippingOnly: 'false',
    sortColumn: mapping.sortColumn,
    page: String(request.page),
    pageSize: String(request.limit),
    sortDescending: mapping.sortDescending,
    savedSearchId: 0,
    useBuyerPrefs: 'true',
    searchUSOnlyShipping: 'false',
    categoryLevelNo: '1',
    partNumber: '',
    catIds: '',
    categoryLevel: 1,
    categoryId: request.categoryId ?? 0,
  };
};

export class AuthorizedHttpShopGoodwillProvider implements ShopGoodwillProvider {
  public readonly mode = 'authorized' as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly rateGate: SerializedRateGate;
  private readonly now: () => number;
  private readonly approvedBaseUrl: URL;

  public constructor(
    private readonly config: ShopGoodwillProviderConfig,
    dependencies: AuthorizedProviderDependencies = {},
  ) {
    if (config.mode !== 'authorized' || config.apiBaseUrl === undefined) {
      throw new Error('AuthorizedHttpShopGoodwillProvider requires authorized configuration');
    }
    this.approvedBaseUrl = new URL(config.apiBaseUrl);
    this.fetchImplementation = dependencies.fetch ?? globalThis.fetch;
    this.now = dependencies.now ?? Date.now;
    this.rateGate = new SerializedRateGate(config.minRequestIntervalMs, this.now);
  }

  private endpoint(path: string): URL {
    let resolved: URL;
    try {
      resolved = new URL(path, this.approvedBaseUrl);
    } catch {
      throw new AppError('not_ready', 'ShopGoodwill provider path is invalid', {
        reason: 'invalid_provider_path',
      });
    }
    if (resolved.origin !== this.approvedBaseUrl.origin) {
      throw new AppError(
        'not_ready',
        'ShopGoodwill provider path is outside the approved provider origin',
        { reason: 'provider_origin_mismatch' },
      );
    }
    if (resolved.username !== '' || resolved.password !== '') {
      throw new AppError('not_ready', 'ShopGoodwill provider path must not contain credentials', {
        reason: 'invalid_provider_path',
      });
    }
    return resolved;
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    body: Readonly<Record<string, unknown>> | undefined,
    signal: AbortSignal,
  ): Promise<unknown> {
    const endpoint = this.endpoint(path);
    return this.rateGate.run(signal, async () => {
      const timeoutController = new AbortController();
      const timeout = setTimeout(
        () => timeoutController.abort('provider request timeout'),
        this.config.requestTimeoutMs,
      );
      const linked = linkSignals(signal, timeoutController.signal);
      try {
        if (linked.signal.aborted) throw cancelledError();
        const headers: Record<string, string> = { accept: 'application/json' };
        if (body !== undefined) headers['content-type'] = 'application/json';
        if (this.config.apiToken !== undefined) {
          headers['authorization'] = `Bearer ${this.config.apiToken}`;
        }

        let response: Response;
        try {
          response = await this.fetchImplementation(endpoint, {
            method,
            headers,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            redirect: 'error',
            signal: linked.signal,
          });
        } catch (error) {
          if (linked.signal.aborted || signal.aborted || timeoutController.signal.aborted) {
            throw new AppError(
              'timeout',
              'The ShopGoodwill provider request timed out or was cancelled',
              undefined,
              true,
              error,
            );
          }
          throw new AppError(
            'upstream_error',
            'The ShopGoodwill provider request failed',
            { reason: 'network_failure' },
            true,
            error,
          );
        }

        if (response.redirected || (response.status >= 300 && response.status < 400)) {
          throw upstreamError('ShopGoodwill provider redirects are not allowed', {
            reason: 'redirect_rejected',
          });
        }
        if (response.status === 404) {
          throw notFound('The requested ShopGoodwill resource was not found');
        }
        if (response.status === 429) {
          throw rateLimited('The ShopGoodwill provider rate limit was reached');
        }
        if (response.status >= 500) {
          throw upstreamError('The ShopGoodwill provider is temporarily unavailable', {
            reason: 'upstream_5xx',
            status: response.status,
          });
        }
        if (!response.ok) {
          throw upstreamError('The ShopGoodwill provider rejected the request', {
            reason: 'upstream_4xx',
            status: response.status,
          });
        }
        try {
          return await readBoundedJson(response, this.config.maxResponseBytes);
        } catch (error) {
          if (error instanceof AppError) throw error;
          if (linked.signal.aborted || signal.aborted || timeoutController.signal.aborted) {
            throw new AppError(
              'timeout',
              'The ShopGoodwill provider request timed out or was cancelled',
              undefined,
              true,
              error,
            );
          }
          throw new AppError(
            'upstream_error',
            'The ShopGoodwill provider response could not be read',
            { reason: 'response_read_failure' },
            true,
            error,
          );
        }
      } finally {
        clearTimeout(timeout);
        linked.dispose();
      }
    });
  }

  public async search(
    input: SearchShopGoodwillRequest,
    signal: AbortSignal,
  ): Promise<SearchShopGoodwillResult> {
    if (input.sort === 'relevance') {
      throw unsupportedProviderFeature(`search sort "${input.sort}"`);
    }
    const payload = await this.request(
      'Search/ItemListing',
      'POST',
      buildSearchRequestBody(input, new Date(this.now())),
      signal,
    );
    return normalizeSearchResponse(payload, input);
  }

  public async getItem(itemId: number, signal: AbortSignal): Promise<ShopGoodwillItem> {
    const payload = await this.request(
      `itemDetail/GetItemDetailModelByItemId/${String(itemId)}`,
      'GET',
      undefined,
      signal,
    );
    return normalizeItemResponse(payload, itemId);
  }

  public async estimateShipping(
    input: EstimateShippingRequest,
    signal: AbortSignal,
  ): Promise<ShippingEstimate> {
    const payload = await this.request(
      'itemDetail/CalculateShipping',
      'POST',
      {
        itemId: input.itemId,
        country: 'US',
        province: null,
        zipCode: input.zipCode,
        quantity: 1,
        clientIP: '',
      },
      signal,
    );
    return normalizeShippingResponse(payload, input.itemId, input.zipCode);
  }

  public async listCategories(
    input: ListDirectoryRequest,
    signal: AbortSignal,
  ): Promise<ShopGoodwillCategoryResult> {
    const payload = await this.request('Category/GetAllCategoryPageList', 'GET', undefined, signal);
    return normalizeCategoriesResponse(payload, input);
  }

  public async listSellers(
    input: ListDirectoryRequest,
    signal: AbortSignal,
  ): Promise<ShopGoodwillSellerResult> {
    if (this.config.sellerDirectoryPath === undefined) {
      throw unsupportedProviderFeature('seller directory lookup');
    }
    const payload = await this.request(this.config.sellerDirectoryPath, 'GET', undefined, signal);
    return normalizeSellersResponse(payload, input);
  }
}
