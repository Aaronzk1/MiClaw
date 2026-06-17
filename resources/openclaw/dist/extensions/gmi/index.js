import { a as buildProviderReplayFamilyHooks } from "../../provider-model-shared-D-lyTLvb.js";
import { a as readConfiguredProviderCatalogEntries } from "../../provider-catalog-shared-DZr41kLr.js";
import { t as defineSingleProviderPluginEntry } from "../../provider-entry-Dh06UXOP.js";
import { n as buildProviderToolCompatFamilyHooks } from "../../provider-tools-VmwDm8UA.js";
import { n as GMI_DEFAULT_MODEL_REF } from "../../models-BpNHR-xE.js";
import { t as buildGmiProvider } from "../../provider-catalog-C7mQUlcD.js";
//#region extensions/gmi/index.ts
const PROVIDER_ID = "gmi";
var gmi_default = defineSingleProviderPluginEntry({
	id: PROVIDER_ID,
	name: "GMI Cloud Provider",
	description: "Bundled GMI Cloud provider plugin",
	provider: {
		label: "GMI Cloud",
		docsPath: "/providers/gmi",
		aliases: ["gmi-cloud", "gmicloud"],
		envVars: ["GMI_API_KEY"],
		auth: [{
			methodId: "api-key",
			label: "GMI Cloud API key",
			hint: "OpenAI-compatible GMI Cloud endpoint",
			optionKey: "gmiApiKey",
			flagName: "--gmi-api-key",
			envVar: "GMI_API_KEY",
			promptMessage: "Enter GMI Cloud API key",
			defaultModel: GMI_DEFAULT_MODEL_REF,
			noteTitle: "GMI Cloud",
			noteMessage: "Manage API keys at https://www.gmicloud.ai/"
		}],
		catalog: {
			buildProvider: buildGmiProvider,
			buildStaticProvider: buildGmiProvider,
			allowExplicitBaseUrl: true
		},
		augmentModelCatalog: ({ config }) => readConfiguredProviderCatalogEntries({
			config,
			providerId: PROVIDER_ID
		}),
		...buildProviderReplayFamilyHooks({
			family: "openai-compatible",
			dropReasoningFromHistory: false
		}),
		...buildProviderToolCompatFamilyHooks("openai")
	}
});
//#endregion
export { gmi_default as default };
