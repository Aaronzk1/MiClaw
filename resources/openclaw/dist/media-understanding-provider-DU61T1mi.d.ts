import { f as MediaUnderstandingProvider, n as AudioTranscriptionResult, t as AudioTranscriptionRequest } from "./types-CYL5O5NV.js";
import { c as DeepInfraSurfaceModel } from "./provider-models-BZrrH_Xx.js";

//#region extensions/deepinfra/media-understanding-provider.d.ts
declare function transcribeDeepInfraAudio(params: AudioTranscriptionRequest): Promise<AudioTranscriptionResult>;
declare function buildDeepInfraMediaUnderstandingProvider(options?: {
  vlmModels?: readonly DeepInfraSurfaceModel[];
  sttModels?: readonly DeepInfraSurfaceModel[];
}): MediaUnderstandingProvider;
declare const deepinfraMediaUnderstandingProvider: MediaUnderstandingProvider;
//#endregion
export { deepinfraMediaUnderstandingProvider as n, transcribeDeepInfraAudio as r, buildDeepInfraMediaUnderstandingProvider as t };