import { i as OpenClawConfig } from "../types.openclaw-DBHlrrVj.js";
import { t as PluginMetadataRegistryView } from "../plugin-metadata-snapshot.types-GA1dWygf.js";
import { cn as ProviderPlugin } from "../types-C0dQmare.js";

//#region src/plugins/provider-discovery.runtime.d.ts
declare function clearProviderDiscoveryModuleLoaders(): void;
declare function resolvePluginDiscoveryProvidersRuntime(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  bundledProviderVitestCompat?: boolean;
  onlyPluginIds?: string[];
  includeUntrustedWorkspacePlugins?: boolean;
  requireCompleteDiscoveryEntryCoverage?: boolean;
  discoveryEntriesOnly?: boolean;
  pluginMetadataSnapshot?: PluginMetadataRegistryView;
}): ProviderPlugin[];
//#endregion
export { clearProviderDiscoveryModuleLoaders, resolvePluginDiscoveryProvidersRuntime };