import { qn as SpeechProviderPlugin } from "./types-C0dQmare.js";
import { c as DeepInfraSurfaceModel } from "./provider-models-BZrrH_Xx.js";
//#region extensions/deepinfra/speech-provider.d.ts
declare function buildDeepInfraSpeechProvider(options?: {
  ttsModels?: readonly DeepInfraSurfaceModel[];
}): SpeechProviderPlugin;
//#endregion
export { buildDeepInfraSpeechProvider as t };