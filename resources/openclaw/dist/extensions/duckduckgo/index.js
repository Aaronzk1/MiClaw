import { t as definePluginEntry } from "../../plugin-entry-C7DUzV0e.js";
import { t as createDuckDuckGoWebSearchProvider } from "../../ddg-search-provider-Cy0VUJN4.js";
//#region extensions/duckduckgo/index.ts
var duckduckgo_default = definePluginEntry({
	id: "duckduckgo",
	name: "DuckDuckGo Plugin",
	description: "Bundled DuckDuckGo web search plugin",
	register(api) {
		api.registerWebSearchProvider(createDuckDuckGoWebSearchProvider());
	}
});
//#endregion
export { duckduckgo_default as default };
