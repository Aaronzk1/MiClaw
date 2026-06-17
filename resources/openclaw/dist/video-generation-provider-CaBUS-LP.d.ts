import { o as VideoGenerationProvider } from "./video-generation-DKTIljfc.js";
import { c as DeepInfraSurfaceModel } from "./provider-models-BZrrH_Xx.js";

//#region extensions/deepinfra/video-generation-provider.d.ts
declare function buildDeepInfraVideoGenerationProvider(options?: {
  videoGenModels?: readonly DeepInfraSurfaceModel[];
}): VideoGenerationProvider;
//#endregion
export { buildDeepInfraVideoGenerationProvider as t };