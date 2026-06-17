import { a as buildProviderReplayFamilyHooks } from "../../provider-model-shared-D-lyTLvb.js";
import { t as defineSingleProviderPluginEntry } from "../../provider-entry-Dh06UXOP.js";
import { i as MOONSHOT_THINKING_STREAM_HOOKS } from "../../provider-stream-CznWl4z7.js";
import "../../provider-stream-family-Ccy0AZQf.js";
import { a as buildMoonshotProvider, i as applyMoonshotNativeStreamingUsageCompat } from "../../provider-catalog-C_q7hjV_.js";
import { n as applyMoonshotConfig, r as applyMoonshotConfigCn, t as MOONSHOT_DEFAULT_MODEL_REF } from "../../onboard-IfUrhGoA.js";
import "../../api-DdK2IowN.js";
import { n as moonshotMediaUnderstandingProvider } from "../../media-understanding-provider-BV_RNi5L2.js";
import { t as createKimiWebSearchProvider } from "../../kimi-web-search-provider-ohKOCUNm.js";
var moonshot_default = defineSingleProviderPluginEntry({
	id: "moonshot",
	name: "Moonshot Provider",
	description: "Bundled Moonshot provider plugin",
	provider: {
		label: "Moonshot",
		docsPath: "/providers/moonshot",
		aliases: ["moonshotai", "moonshot-ai"],
		auth: [{
			methodId: "api-key",
			label: "Kimi API key (.ai)",
			hint: "Kimi K2.6 + Kimi",
			optionKey: "moonshotApiKey",
			flagName: "--moonshot-api-key",
			envVar: "MOONSHOT_API_KEY",
			promptMessage: "Enter Moonshot API key",
			defaultModel: MOONSHOT_DEFAULT_MODEL_REF,
			applyConfig: (cfg) => applyMoonshotConfig(cfg),
			wizard: { groupLabel: "Moonshot AI (Kimi K2.6)" }
		}, {
			methodId: "api-key-cn",
			label: "Kimi API key (.cn)",
			hint: "Kimi K2.6 + Kimi",
			optionKey: "moonshotApiKey",
			flagName: "--moonshot-api-key",
			envVar: "MOONSHOT_API_KEY",
			promptMessage: "Enter Moonshot API key (.cn)",
			defaultModel: MOONSHOT_DEFAULT_MODEL_REF,
			applyConfig: (cfg) => applyMoonshotConfigCn(cfg),
			wizard: { groupLabel: "Moonshot AI (Kimi K2.6)" }
		}],
		catalog: {
			buildProvider: buildMoonshotProvider,
			buildStaticProvider: buildMoonshotProvider,
			allowExplicitBaseUrl: true
		},
		applyNativeStreamingUsageCompat: ({ providerConfig }) => applyMoonshotNativeStreamingUsageCompat(providerConfig),
		...buildProviderReplayFamilyHooks({
			family: "openai-compatible",
			sanitizeToolCallIds: false,
			dropReasoningFromHistory: false
		}),
		...MOONSHOT_THINKING_STREAM_HOOKS,
		resolveThinkingProfile: () => ({
			levels: [{
				id: "off",
				label: "off"
			}, {
				id: "low",
				label: "on"
			}],
			defaultLevel: "off"
		})
	},
	register(api) {
		api.registerMediaUnderstandingProvider(moonshotMediaUnderstandingProvider);
		api.registerWebSearchProvider(createKimiWebSearchProvider());
	}
});
//#endregion
export { moonshot_default as default };
