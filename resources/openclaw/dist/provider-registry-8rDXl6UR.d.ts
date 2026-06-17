import { i as OpenClawConfig } from "./types.openclaw-DBHlrrVj.js";
import { a as ImageGenerationProviderPlugin } from "./types-C0dQmare.js";

//#region src/image-generation/provider-registry.d.ts
/** Lists canonical image-generation providers visible for config. */
declare function listImageGenerationProviders(cfg?: OpenClawConfig): ImageGenerationProviderPlugin[];
/** Resolves an image-generation provider by canonical id or alias. */
declare function getImageGenerationProvider(providerId: string | undefined, cfg?: OpenClawConfig): ImageGenerationProviderPlugin | undefined;
//#endregion
export { listImageGenerationProviders as n, getImageGenerationProvider as t };