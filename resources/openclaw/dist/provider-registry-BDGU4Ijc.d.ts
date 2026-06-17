import { i as OpenClawConfig } from "./types.openclaw-DBHlrrVj.js";
import { Zn as VideoGenerationProviderPlugin } from "./types-C0dQmare.js";

//#region src/video-generation/provider-registry.d.ts
declare function listVideoGenerationProviders(cfg?: OpenClawConfig): VideoGenerationProviderPlugin[];
declare function getVideoGenerationProvider(providerId: string | undefined, cfg?: OpenClawConfig): VideoGenerationProviderPlugin | undefined;
//#endregion
export { listVideoGenerationProviders as n, getVideoGenerationProvider as t };