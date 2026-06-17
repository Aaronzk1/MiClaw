import { g as readPositiveIntegerParam } from "./common-C4yy9V-D.js";
import "./param-readers-HkqGooLN.js";
import { r as buildFirecrawlWebSearchProviderBase } from "./web-search-shared-DwGUlBhx.js";
//#region extensions/firecrawl/src/firecrawl-search-provider.ts
let firecrawlClientModulePromise;
function loadFirecrawlClientModule() {
	firecrawlClientModulePromise ??= import("./firecrawl-client-c_BSroB7.js");
	return firecrawlClientModulePromise;
}
const GenericFirecrawlSearchSchema = {
	type: "object",
	properties: {
		query: {
			type: "string",
			description: "Search query string."
		},
		count: {
			type: "integer",
			description: "Number of results to return (1-10).",
			minimum: 1,
			maximum: 10
		}
	},
	additionalProperties: false
};
function createFirecrawlWebSearchProvider() {
	return {
		...buildFirecrawlWebSearchProviderBase(),
		createTool: (ctx) => ({
			description: "Search the web using Firecrawl. Returns structured results with snippets from Firecrawl Search. Use firecrawl_search for Firecrawl-specific knobs like sources or categories.",
			parameters: GenericFirecrawlSearchSchema,
			execute: async (args) => {
				const { runFirecrawlSearch } = await loadFirecrawlClientModule();
				return await runFirecrawlSearch({
					cfg: ctx.config,
					query: typeof args.query === "string" ? args.query : "",
					count: readPositiveIntegerParam(args, "count", {
						message: "count must be an integer from 1 to 10",
						max: 10
					})
				});
			}
		})
	};
}
//#endregion
export { createFirecrawlWebSearchProvider as t };
