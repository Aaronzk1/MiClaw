import { C as VideoDescriptionResult, S as VideoDescriptionRequest, f as MediaUnderstandingProvider } from "../../types-CYL5O5NV.js";
//#region extensions/qwen/media-understanding-provider.d.ts
declare function describeQwenVideo(params: VideoDescriptionRequest): Promise<VideoDescriptionResult>;
declare function buildQwenMediaUnderstandingProvider(): MediaUnderstandingProvider;
//#endregion
export { buildQwenMediaUnderstandingProvider, describeQwenVideo };