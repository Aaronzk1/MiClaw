import { i as OpenClawConfig } from "./types.openclaw-DABkiMzt.js";
import { Zn as VideoGenerationProviderPlugin } from "./types-BVAOMoZy.js";

//#region src/video-generation/provider-registry.d.ts
declare function listVideoGenerationProviders(cfg?: OpenClawConfig): VideoGenerationProviderPlugin[];
declare function getVideoGenerationProvider(providerId: string | undefined, cfg?: OpenClawConfig): VideoGenerationProviderPlugin | undefined;
//#endregion
export { listVideoGenerationProviders as n, getVideoGenerationProvider as t };