import { n as buildTavilyWebSearchProviderBase } from "../../web-search-shared-C-InZaFj.js";
//#region extensions/tavily/web-search-contract-api.ts
function createTavilyWebSearchProvider() {
	return {
		...buildTavilyWebSearchProviderBase(),
		createTool: () => null
	};
}
//#endregion
export { createTavilyWebSearchProvider };
