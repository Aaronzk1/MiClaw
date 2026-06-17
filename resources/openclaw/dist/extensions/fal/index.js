import { t as definePluginEntry } from "../../plugin-entry-C7DUzV0e.js";
import { t as buildFalImageGenerationProvider } from "../../image-generation-provider-F5DmX5yf.js";
import { t as buildFalMusicGenerationProvider } from "../../music-generation-provider-DlFB25rs.js";
import { t as createFalProvider } from "../../provider-registration-C1qLhg5s.js";
import { t as buildFalVideoGenerationProvider } from "../../video-generation-provider-i8_zgsdp.js";
var fal_default = definePluginEntry({
	id: "fal",
	name: "fal Provider",
	description: "Bundled fal image, video, and music generation provider",
	register(api) {
		api.registerProvider(createFalProvider());
		api.registerImageGenerationProvider(buildFalImageGenerationProvider());
		api.registerMusicGenerationProvider(buildFalMusicGenerationProvider());
		api.registerVideoGenerationProvider(buildFalVideoGenerationProvider());
	}
});
//#endregion
export { fal_default as default };
