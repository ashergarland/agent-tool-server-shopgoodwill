import { createAgentToolApplication } from '@agent-tool-platform/runtime/capability';
import { createSilentLogger } from '@agent-tool-platform/runtime/logging';
import { afterEach, describe, expect, it } from 'vitest';
import { capability } from '../../src/capability.js';
import { DisabledShopGoodwillProvider } from '../../src/providers/disabled.js';

const applications: Array<Awaited<ReturnType<typeof createAgentToolApplication>>> = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.shutdown()));
});

const readinessFor = async (providerEnv: NodeJS.ProcessEnv) => {
  const application = await createAgentToolApplication(capability, {
    logger: createSilentLogger(),
    readinessCacheMs: 0,
    env: {
      NODE_ENV: 'development',
      AUTH_MODE: 'disabled',
      ...providerEnv,
    },
  });
  applications.push(application);
  await application.start();
  return application.readiness();
};

describe('provider modes and readiness', () => {
  it('returns a normalized not-ready error in disabled mode', async () => {
    const provider = new DisabledShopGoodwillProvider();
    for (const operation of [
      () => provider.search(),
      () => provider.getItem(),
      () => provider.estimateShipping(),
      () => provider.listCategories(),
      () => provider.listSellers(),
    ]) {
      await expect(operation()).rejects.toMatchObject({
        code: 'not_ready',
        details: { reason: 'provider_disabled' },
      });
    }
  });

  it('reports disabled as not ready and fixture as ready without a network probe', async () => {
    const disabled = await readinessFor({ SHOPGOODWILL_PROVIDER_MODE: 'disabled' });
    expect(disabled.ready).toBe(false);
    expect(disabled.checks).toContainEqual(
      expect.objectContaining({ name: 'shopgoodwill-provider', state: 'not_ready' }),
    );

    const fixture = await readinessFor({ SHOPGOODWILL_PROVIDER_MODE: 'fixture' });
    expect(fixture.ready).toBe(true);
    const fixtureCheck = fixture.checks.find(({ name }) => name === 'shopgoodwill-provider');
    expect(fixtureCheck).toMatchObject({ state: 'ready' });
    expect(fixtureCheck?.detail).toMatch(/Synthetic fixture/iu);
  });

  it('reports an authorized provider ready only after explicit configuration', async () => {
    const defaultRoute = await readinessFor({
      SHOPGOODWILL_PROVIDER_MODE: 'authorized',
      SHOPGOODWILL_API_BASE_URL: 'https://provider.example/api',
      SHOPGOODWILL_ACCESS_APPROVED: 'true',
    });
    expect(defaultRoute.ready).toBe(true);
    const defaultRouteCheck = defaultRoute.checks.find(
      ({ name }) => name === 'shopgoodwill-provider',
    );
    expect(defaultRouteCheck).toMatchObject({ state: 'ready' });
    expect(defaultRouteCheck?.detail).toMatch(/verified seller-directory route/iu);

    const ready = await readinessFor({
      SHOPGOODWILL_PROVIDER_MODE: 'authorized',
      SHOPGOODWILL_API_BASE_URL: 'https://provider.example/api',
      SHOPGOODWILL_ACCESS_APPROVED: 'true',
      SHOPGOODWILL_SELLER_DIRECTORY_PATH: 'directory/sellers',
    });
    expect(ready.ready).toBe(true);
    expect(ready.checks).toContainEqual(
      expect.objectContaining({ name: 'shopgoodwill-provider', state: 'ready' }),
    );
  });
});
