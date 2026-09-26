import type { CapabilityManifest } from '@agent-tool-platform/runtime/capability';
import packageManifest from '../package.json' with { type: 'json' };

export const capabilityManifest: CapabilityManifest = {
  name: 'agent-tool-server-shopgoodwill',
  version: packageManifest.version,
  title: 'ShopGoodwill Research Capability',
  description:
    'Read-only ShopGoodwill listing research with disabled, synthetic fixture, and explicitly authorized provider modes.',
  documentationUrl: 'https://github.com/ashergarland/agent-tool-server-shopgoodwill#readme',
};
