import { m as ModelProviderDeclarationConfig } from "./types.models-O5iWV16x.js";
import { cn as ProviderPlugin } from "./types-C0dQmare.js";
import { a as LiveModelCatalogFetchGuard } from "./provider-catalog-live-runtime-vsaGcx5d.js";

//#region extensions/openai/openai-provider.d.ts
type BuildOpenAILiveProviderConfigParams = {
  apiKey: string;
  baseUrl?: string;
  discoveryApiKey?: string;
  env?: Record<string, string | undefined>;
  fetchGuard?: LiveModelCatalogFetchGuard;
  signal?: AbortSignal;
};
declare function buildOpenAILiveProviderConfig(params: BuildOpenAILiveProviderConfigParams): Promise<ModelProviderDeclarationConfig>;
declare function buildOpenAICodexLiveProviderConfig(params: {
  discoveryApiKey: string;
  accountId?: string;
  fetchGuard?: LiveModelCatalogFetchGuard;
  signal?: AbortSignal;
}): Promise<ModelProviderDeclarationConfig>;
declare function buildOpenAIProvider(): ProviderPlugin;
/** @deprecated Use buildOpenAIProvider; OpenAI Codex is now an OpenAI auth/transport mode. */
declare function buildOpenAICodexProviderPlugin(): ProviderPlugin;
//#endregion
export { buildOpenAIProvider as i, buildOpenAICodexProviderPlugin as n, buildOpenAILiveProviderConfig as r, buildOpenAICodexLiveProviderConfig as t };