import { t as definePluginEntry } from "../../plugin-entry-C7DUzV0e.js";
import { r as resolvePluginConfigObject } from "../../plugin-config-runtime-CpE6DYgJ.js";
import { n as buildProviderToolCompatFamilyHooks } from "../../provider-tools-VmwDm8UA.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-tlWJLTsv.js";
import { t as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-sDBqXE6C.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-BwPXWm_5.js";
import { i as buildOpenAIProvider } from "../../openai-provider-DDg3PsVe.js";
import { a as resolveOpenAISystemPromptContribution, i as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-Chdn3xwX.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-uan_uG43.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-gbQmqq-P.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-fXC6cboA.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-D_qCard6.js";
//#region extensions/openai/index.ts
var openai_default = definePluginEntry({
	id: "openai",
	name: "OpenAI Provider",
	description: "Bundled OpenAI provider plugins",
	register(api) {
		const openAIToolCompatHooks = buildProviderToolCompatFamilyHooks("openai");
		const buildProviderWithPromptContribution = (provider) => ({
			...provider,
			...openAIToolCompatHooks,
			resolveSystemPromptContribution: (ctx) => {
				const pluginConfig = resolvePluginConfigObject(ctx.config, "openai") ?? (ctx.config ? void 0 : api.pluginConfig);
				return resolveOpenAISystemPromptContribution({
					config: ctx.config,
					legacyPluginConfig: pluginConfig,
					mode: resolveOpenAIPromptOverlayMode(pluginConfig),
					modelProviderId: provider.id,
					modelId: ctx.modelId,
					trigger: ctx.trigger
				});
			}
		});
		api.registerProvider(buildProviderWithPromptContribution(buildOpenAIProvider()));
		api.registerMemoryEmbeddingProvider(openAiMemoryEmbeddingProviderAdapter);
		api.registerImageGenerationProvider(buildOpenAIImageGenerationProvider());
		api.registerRealtimeTranscriptionProvider(buildOpenAIRealtimeTranscriptionProvider());
		api.registerRealtimeVoiceProvider(buildOpenAIRealtimeVoiceProvider());
		api.registerSpeechProvider(buildOpenAISpeechProvider());
		api.registerMediaUnderstandingProvider(openaiMediaUnderstandingProvider);
		api.registerVideoGenerationProvider(buildOpenAIVideoGenerationProvider());
	}
});
//#endregion
export { openai_default as default };
