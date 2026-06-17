import { i as MemoryEmbeddingProviderAdapter } from "./memory-embedding-providers-DkPGGFtP.js";
import { c as DeepInfraSurfaceModel } from "./provider-models-BZrrH_Xx.js";
//#region extensions/deepinfra/memory-embedding-adapter.d.ts
declare function buildDeepInfraMemoryEmbeddingAdapter(options?: {
  embedModels?: readonly DeepInfraSurfaceModel[];
}): MemoryEmbeddingProviderAdapter;
declare const deepinfraMemoryEmbeddingProviderAdapter: MemoryEmbeddingProviderAdapter;
//#endregion
export { deepinfraMemoryEmbeddingProviderAdapter as n, buildDeepInfraMemoryEmbeddingAdapter as t };