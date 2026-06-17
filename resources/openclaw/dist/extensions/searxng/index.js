import { t as definePluginEntry } from "../../plugin-entry-C7DUzV0e.js";
import { t as createSearxngWebSearchProvider } from "../../searxng-search-provider-Cqq5N02I.js";
//#region extensions/searxng/index.ts
var searxng_default = definePluginEntry({
	id: "searxng",
	name: "SearXNG Plugin",
	description: "Bundled SearXNG web search plugin",
	register(api) {
		api.registerWebSearchProvider(createSearxngWebSearchProvider());
	}
});
//#endregion
export { searxng_default as default };
