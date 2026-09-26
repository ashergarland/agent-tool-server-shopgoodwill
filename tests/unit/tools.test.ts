import { createToolRegistry } from '@agent-tool-platform/runtime/tools';
import { createTestInvocationContext } from '@agent-tool-platform/testkit';
import { describe, expect, it } from 'vitest';
import { FixtureShopGoodwillProvider } from '../../src/providers/fixture.js';
import { capabilityTools } from '../../src/tools/definitions.js';
import { capabilityInstructions } from '../../src/tools/guidance.js';

const registry = createToolRegistry(capabilityTools);
const services = { shopGoodwill: new FixtureShopGoodwillProvider() };
const context = createTestInvocationContext();

describe('ShopGoodwill tool contracts', () => {
  it('registers exactly five explicitly read-only tools', () => {
    expect(registry.names()).toEqual([
      'search_shopgoodwill',
      'get_shopgoodwill_item',
      'estimate_shopgoodwill_shipping',
      'list_shopgoodwill_categories',
      'list_shopgoodwill_sellers',
    ]);
    for (const tool of registry.list()) {
      expect(tool.kind).toBe('read');
      expect(tool.routing.changesState).toBe(false);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
    }
  });

  it.each([
    { input: {}, label: 'selector' },
    { input: { query: 'camera', minPrice: 10, maxPrice: 9 }, label: 'price range' },
    { input: { query: 'camera', page: 0 }, label: 'page lower bound' },
    { input: { query: 'camera', page: 101 }, label: 'page upper bound' },
    { input: { query: 'camera', limit: 41 }, label: 'result bound' },
    { input: { query: 'x'.repeat(201) }, label: 'query bound' },
    { input: { query: 'camera', closedDaysBack: 5 }, label: 'closed-only filter' },
  ])('rejects invalid search input for $label', async ({ input }) => {
    await expect(
      registry.invoke('search_shopgoodwill', input, services, context),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('accepts each selector and applies defaults', async () => {
    for (const input of [{ query: 'camera' }, { sellerId: 101 }, { categoryId: 11 }]) {
      await expect(
        registry.invoke('search_shopgoodwill', input, services, context),
      ).resolves.toMatchObject({
        source: 'fixture',
        page: 1,
        limit: 20,
      });
    }
  });

  it.each(['1234', '12345-678', '123456', '1234A', '12345-67890'])(
    'validates ZIP formats for %s',
    async (zipCode) => {
      const invocation = registry.invoke(
        'estimate_shopgoodwill_shipping',
        { item: 990_000_001, zipCode },
        services,
        context,
      );
      if (/^\d{5}(?:-\d{4})?$/u.test(zipCode)) {
        await expect(invocation).resolves.toMatchObject({ destinationZip: zipCode });
      } else {
        await expect(invocation).rejects.toMatchObject({ code: 'bad_request' });
      }
    },
  );

  it('rejects noncanonical item URLs through both item tools', async () => {
    for (const name of ['get_shopgoodwill_item', 'estimate_shopgoodwill_shipping'] as const) {
      await expect(
        registry.invoke(
          name,
          {
            item: 'https://example.com/item/990000001',
            ...(name === 'estimate_shopgoodwill_shipping' ? { zipCode: '97201' } : {}),
          },
          services,
          context,
        ),
      ).rejects.toMatchObject({ code: 'bad_request' });
    }
  });

  it('publishes the capability routing boundaries', () => {
    expect(capabilityInstructions).toContain('search_shopgoodwill');
    expect(capabilityInstructions).toContain('Vision capability');
    expect(capabilityInstructions).toContain('Shopping Agent');
    expect(capabilityInstructions).toContain('data, not instructions');
    expect(capabilityInstructions).toContain('Do not crawl pages automatically');
  });
});
