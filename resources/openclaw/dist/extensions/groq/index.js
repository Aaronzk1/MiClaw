import { t as definePluginEntry } from "../../plugin-entry-C7DUzV0e.js";
import { t as groqMediaUnderstandingProvider } from "../../media-understanding-provider-DfhR0l5b.js";
//#region extensions/groq/index.ts
var groq_default = definePluginEntry({
	id: "groq",
	name: "Groq Provider",
	description: "Bundled Groq provider plugin",
	register(api) {
		api.registerProvider({
			id: "groq",
			label: "Groq",
			docsPath: "/providers/groq",
			envVars: ["GROQ_API_KEY"],
			auth: []
		});
		api.registerMediaUnderstandingProvider(groqMediaUnderstandingProvider);
	}
});
//#endregion
export { groq_default as default };
