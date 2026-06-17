import { t as definePluginEntry } from "../../plugin-entry-C7DUzV0e.js";
import { t as buildAlibabaVideoGenerationProvider } from "../../video-generation-provider-CXCsmhjK.js";
//#region extensions/alibaba/index.ts
/**
* Alibaba Model Studio plugin entry. Registers the DashScope-backed video
* generation provider.
*/
var alibaba_default = definePluginEntry({
	id: "alibaba",
	name: "Alibaba Model Studio Plugin",
	description: "Bundled Alibaba Model Studio video provider plugin",
	register(api) {
		api.registerVideoGenerationProvider(buildAlibabaVideoGenerationProvider());
	}
});
//#endregion
export { alibaba_default as default };
