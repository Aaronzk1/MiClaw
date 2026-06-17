import { t as definePluginEntry } from "../../plugin-entry-C7DUzV0e.js";
import { t as deepgramMediaUnderstandingProvider } from "../../media-understanding-provider-DxOPZZ7k.js";
import { t as buildDeepgramRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-pN7dze0m.js";
//#region extensions/deepgram/index.ts
var deepgram_default = definePluginEntry({
	id: "deepgram",
	name: "Deepgram Media Understanding",
	description: "Bundled Deepgram audio transcription provider",
	register(api) {
		api.registerMediaUnderstandingProvider(deepgramMediaUnderstandingProvider);
		api.registerRealtimeTranscriptionProvider(buildDeepgramRealtimeTranscriptionProvider());
	}
});
//#endregion
export { deepgram_default as default };
