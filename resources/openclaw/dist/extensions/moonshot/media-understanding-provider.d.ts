import { C as VideoDescriptionResult, S as VideoDescriptionRequest, f as MediaUnderstandingProvider } from "../../types-CYL5O5NV.js";
//#region extensions/moonshot/media-understanding-provider.d.ts
declare function describeMoonshotVideo(params: VideoDescriptionRequest): Promise<VideoDescriptionResult>;
declare const moonshotMediaUnderstandingProvider: MediaUnderstandingProvider;
//#endregion
export { describeMoonshotVideo, moonshotMediaUnderstandingProvider };