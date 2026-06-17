import { l as ImageGenerationProvider } from "./types-BncZP6Hi.js";
import { c as DeepInfraSurfaceModel } from "./provider-models-BZrrH_Xx.js";

//#region extensions/deepinfra/image-generation-provider.d.ts
declare function buildDeepInfraImageGenerationProvider(options?: {
  imageGenModels?: readonly DeepInfraSurfaceModel[];
}): ImageGenerationProvider;
//#endregion
export { buildDeepInfraImageGenerationProvider as t };