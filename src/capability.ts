import {
  defineAgentToolCapability,
  type AgentToolCapability,
} from '@agent-tool-platform/runtime/capability';
import {
  readinessDegraded,
  readinessNotReady,
  readinessReady,
} from '@agent-tool-platform/runtime/lifecycle';
import { shopGoodwillConfig, type ShopGoodwillConfig } from './config.js';
import { capabilityManifest } from './manifest.js';
import { createShopGoodwillProvider } from './providers/create-provider.js';
import type { CapabilityServices } from './providers/provider.js';
import { capabilityTools } from './tools/definitions.js';
import { capabilityInstructions } from './tools/guidance.js';

export const capability: AgentToolCapability<CapabilityServices, ShopGoodwillConfig> =
  defineAgentToolCapability({
    manifest: capabilityManifest,
    instructions: capabilityInstructions,
    config: shopGoodwillConfig,
    tools: capabilityTools,

    createServices(context): CapabilityServices {
      return { shopGoodwill: createShopGoodwillProvider(context.config.shopGoodwill) };
    },

    readiness: [
      ({ config }) => {
        const provider = config.shopGoodwill;
        switch (provider.mode) {
          case 'disabled':
            return readinessNotReady(
              'shopgoodwill-provider',
              'Live ShopGoodwill access is disabled and no network requests will be made.',
            );
          case 'fixture':
            return readinessReady(
              'shopgoodwill-provider',
              'Synthetic fixture mode is ready; no network requests will be made.',
            );
          case 'authorized':
            return provider.sellerDirectoryPath === undefined
              ? readinessDegraded(
                  'shopgoodwill-provider',
                  'Authorized provider is configured; seller directory lookup is unavailable.',
                )
              : readinessReady(
                  'shopgoodwill-provider',
                  'Authorized provider and verified seller-directory route are configured.',
                );
        }
      },
    ],
  });
