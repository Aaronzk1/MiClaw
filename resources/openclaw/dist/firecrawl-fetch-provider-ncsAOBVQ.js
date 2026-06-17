import { n as enablePluginInConfig } from "./enable-DXODwa0_.js";
import { g as readPositiveIntegerParam } from "./common-C4yy9V-D.js";
import "./provider-web-fetch-vmFzBVVG.js";
import "./param-readers-HkqGooLN.js";
import { r as runFirecrawlScrape } from "./firecrawl-client-Dj3JHV0L.js";
import { t as FIRECRAWL_WEB_FETCH_PROVIDER_SHARED } from "./firecrawl-fetch-provider-shared-B092OBns.js";
//#region extensions/firecrawl/src/firecrawl-fetch-provider.ts
function createFirecrawlWebFetchProvider() {
	return {
		...FIRECRAWL_WEB_FETCH_PROVIDER_SHARED,
		applySelectionConfig: (config) => enablePluginInConfig(config, "firecrawl").config,
		createTool: ({ config }) => ({
			description: "Fetch a page using Firecrawl.",
			parameters: {},
			execute: async (args) => {
				const url = typeof args.url === "string" ? args.url : "";
				const extractMode = args.extractMode === "text" ? "text" : "markdown";
				const maxChars = readPositiveIntegerParam(args, "maxChars");
				const proxy = args.proxy === "basic" || args.proxy === "stealth" || args.proxy === "auto" ? args.proxy : void 0;
				const storeInCache = typeof args.storeInCache === "boolean" ? args.storeInCache : void 0;
				return await runFirecrawlScrape({
					cfg: config,
					url,
					extractMode,
					maxChars,
					...proxy ? { proxy } : {},
					...storeInCache !== void 0 ? { storeInCache } : {}
				});
			}
		})
	};
}
//#endregion
export { createFirecrawlWebFetchProvider as t };
