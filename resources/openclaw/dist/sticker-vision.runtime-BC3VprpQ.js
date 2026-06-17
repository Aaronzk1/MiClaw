import { x as findModelInCatalog } from "./model-selection-shared-b32cUYts.js";
import { c as resolveDefaultModelForAgent } from "./model-selection-CA_65iXi.js";
import { i as modelSupportsVision, n as loadModelCatalog } from "./model-catalog-0-HKr2yW.js";
import "./agent-runtime-CvpQRNVf.js";
//#region extensions/telegram/src/sticker-vision.runtime.ts
async function resolveStickerVisionSupportRuntime(params) {
	const catalog = await loadModelCatalog({ config: params.cfg });
	const defaultModel = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.agentId
	});
	const entry = findModelInCatalog(catalog, defaultModel.provider, defaultModel.model);
	if (!entry) return false;
	return modelSupportsVision(entry);
}
//#endregion
export { resolveStickerVisionSupportRuntime };
