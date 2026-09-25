import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { capability } from '../../src/capability.js';

interface Profile {
  readonly id: string;
  readonly dimensions: Record<string, string>;
  readonly requiredSecrets: readonly string[];
  readonly providerPrerequisites: readonly unknown[];
  readonly identity: { readonly rbac: readonly string[] };
  readonly delivery: {
    readonly publication: { readonly identifier: string };
    readonly entrypoint: { readonly reference: string; readonly interface: string };
  };
  readonly configuration: {
    readonly schema: {
      readonly id: string;
      readonly capabilityId: string;
      readonly path: string;
    };
    readonly bounded: boolean;
  };
  readonly workload?: unknown;
  readonly mutation?: unknown;
}

interface Declaration {
  readonly capability: {
    readonly id: string;
    readonly displayName: string;
    readonly repository: string;
  };
  readonly profiles: readonly Profile[];
}

const load = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

describe('ShopGoodwill capability profile truthfulness', () => {
  it('matches repository, package, manifest, and configuration identity', async () => {
    const declaration = (await load('../../capability-profiles.json')) as Declaration;
    const server = (await load('../../server.json')) as {
      readonly name: string;
      readonly repository: { readonly url: string };
    };
    const manifest = (await load('../../package.json')) as {
      readonly name: string;
      readonly version: string;
    };
    expect(declaration.capability).toEqual({
      id: server.name,
      displayName: capability.manifest.title,
      repository: server.repository.url,
    });

    const configurationSchema = (await load('../../schemas/local-configuration.schema.json')) as {
      readonly $id: string;
    };
    for (const profile of declaration.profiles) {
      expect(profile.delivery.publication.identifier).toBe(manifest.name);
      expect(profile.delivery.entrypoint).toEqual({
        reference: 'dist/stdio.js',
        interface: 'stdio',
      });
      expect(profile.configuration).toEqual({
        schema: {
          id: configurationSchema.$id,
          capabilityId: declaration.capability.id,
          path: 'schemas/local-configuration.schema.json',
        },
        bounded: true,
      });
    }
    expect(capability.manifest.version).toBe(manifest.version);
  });

  it('declares separate fixture and authorized provider shapes', async () => {
    const declaration = (await load('../../capability-profiles.json')) as Declaration;
    const fixture = declaration.profiles.find(({ id }) => id === 'local-fixture');
    const authorized = declaration.profiles.find(({ id }) => id === 'local-authorized-token');

    expect(fixture?.dimensions).toEqual({
      execution: 'local',
      delivery: 'package',
      access: 'local-process',
      workload: 'none',
      provider: 'none',
      mutation: 'read-only',
    });
    expect(fixture?.requiredSecrets).toEqual([]);
    expect(fixture?.providerPrerequisites).toEqual([]);
    expect(fixture).not.toHaveProperty('workload');

    expect(authorized?.dimensions).toEqual({
      execution: 'local',
      delivery: 'package',
      access: 'local-process',
      workload: 'provider',
      provider: 'external',
      mutation: 'read-only',
    });
    expect(authorized?.requiredSecrets).toEqual(['SHOPGOODWILL_API_TOKEN']);
    expect(authorized?.providerPrerequisites).toHaveLength(2);
    expect(authorized?.identity.rbac).toHaveLength(1);
    expect(authorized).toHaveProperty('workload');
    expect(capability.tools.every((tool) => tool.kind === 'read')).toBe(true);
    expect(capability.tools.every((tool) => !tool.routing.changesState)).toBe(true);
  });

  it('contains no operator instance, live endpoint, credential, or account requirement', async () => {
    const declaration = await load('../../capability-profiles.json');
    const serialized = JSON.stringify(declaration);
    expect(serialized).not.toMatch(
      /subscription|tenant|key.?vault|resource.?group|container.?app|secretValue/iu,
    );
    expect(serialized).not.toContain('buyer-api.shopgoodwill');
  });
});
