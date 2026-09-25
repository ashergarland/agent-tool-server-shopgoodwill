import { badRequest } from '@agent-tool-platform/runtime/errors';

export const SHOPGOODWILL_ITEM_HOSTS = ['shopgoodwill.com', 'www.shopgoodwill.com'] as const;
const MAX_SAFE_ITEM_ID = Number.MAX_SAFE_INTEGER;

const parseDigits = (value: string): number | undefined => {
  if (!/^[1-9]\d*$/u.test(value)) return undefined;
  const itemId = Number(value);
  return Number.isSafeInteger(itemId) && itemId <= MAX_SAFE_ITEM_ID ? itemId : undefined;
};

export const canonicalItemUrl = (itemId: number): string =>
  `https://shopgoodwill.com/item/${String(itemId)}`;

export const parseShopGoodwillItemId = (item: number | string): number => {
  if (typeof item === 'number') {
    if (Number.isSafeInteger(item) && item > 0) return item;
    throw badRequest('item must be a positive safe integer or canonical ShopGoodwill item URL');
  }

  const trimmed = item.trim();
  const numeric = parseDigits(trimmed);
  if (numeric !== undefined) return numeric;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw badRequest('item must be a positive numeric ID or canonical ShopGoodwill HTTPS item URL');
  }

  if (
    url.protocol !== 'https:' ||
    !SHOPGOODWILL_ITEM_HOSTS.includes(
      url.hostname.toLowerCase() as (typeof SHOPGOODWILL_ITEM_HOSTS)[number],
    ) ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw badRequest('item URL must be a canonical HTTPS ShopGoodwill item URL');
  }

  const pathMatch = /^\/item\/([1-9]\d*)\/?$/iu.exec(url.pathname);
  const itemId = pathMatch?.[1] === undefined ? undefined : parseDigits(pathMatch[1]);
  if (itemId === undefined) {
    throw badRequest('item URL path must be /item/{positive-item-id}');
  }
  return itemId;
};
