import { c as MusicGenerationProvider } from "./types-BgrsB15F.js";
import { t as ProviderOperationDeadline } from "./provider-http-D3zLmyzn.js";
//#region extensions/openrouter/music-generation-provider.d.ts
type OpenRouterAudioStreamResult = {
  audioBuffer: Buffer;
  transcript: string;
};
declare function readOpenRouterAudioStream(response: Response, deadline: ProviderOperationDeadline): Promise<OpenRouterAudioStreamResult>;
declare function buildOpenRouterMusicGenerationProvider(): MusicGenerationProvider;
declare const openRouterMusicTestInternals: {
  readOpenRouterAudioStream: typeof readOpenRouterAudioStream;
};
//#endregion
export { openRouterMusicTestInternals as n, buildOpenRouterMusicGenerationProvider as t };