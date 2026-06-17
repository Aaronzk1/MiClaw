import { f as UnifiedModelCatalogEntry } from "./manifest-registry-C_uwfra_.js";
import { ln as UnifiedModelCatalogProviderContext } from "./plugin-entry-BOAJmgcf.js";
import { a as VideoGenerationModelCapabilitiesContext, s as VideoGenerationProviderCapabilities } from "./video-generation-DKTIljfc.js";

//#region extensions/openrouter/video-model-catalog.d.ts
type OpenRouterVideoModelCatalogCapabilities = VideoGenerationProviderCapabilities & {
  allowedPassthroughParameters?: readonly string[];
  canonicalSlug?: string;
  created?: number;
  description?: string;
  pricingSkus?: Readonly<Record<string, string>>;
};
declare function listOpenRouterVideoModelCatalog(ctx: UnifiedModelCatalogProviderContext): Promise<Array<UnifiedModelCatalogEntry<OpenRouterVideoModelCatalogCapabilities>> | null>;
declare function resolveOpenRouterVideoModelCapabilities(ctx: VideoGenerationModelCapabilitiesContext): Promise<VideoGenerationProviderCapabilities | undefined>;
//#endregion
export { listOpenRouterVideoModelCatalog as n, resolveOpenRouterVideoModelCapabilities as r, OpenRouterVideoModelCatalogCapabilities as t };