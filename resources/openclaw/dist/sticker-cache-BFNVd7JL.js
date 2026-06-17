import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-mnp54Vah.js";
import { r as logVerbose } from "./globals-GTrXU4s9.js";
import { x as findModelInCatalog } from "./model-selection-shared-b32cUYts.js";
import { c as resolveDefaultModelForAgent } from "./model-selection-CA_65iXi.js";
import { i as modelSupportsVision, n as loadModelCatalog } from "./model-catalog-0-HKr2yW.js";
import { d as resolveApiKeyForProvider } from "./model-auth-DVfmdW0b.js";
import { n as resolveAutoMediaKeyProviders, r as resolveDefaultMediaModel } from "./defaults-BK9rbdLc.js";
import "./media-runtime-fgpmX6eL.js";
import { r as resolveAutoImageModel } from "./runner-CswjdYkd.js";
import "./runtime-env-D_2q8-VK.js";
import "./string-coerce-runtime-CEGJWkQ_.js";
import "./agent-runtime-CvpQRNVf.js";
import { n as getTelegramRuntime } from "./runtime-B_f_VNpK2.js";
import "./sticker-cache-store-mh6jiBwt.js";
//#region extensions/telegram/src/sticker-cache.ts
const STICKER_DESCRIPTION_PROMPT = "Describe this sticker image in 1-2 sentences. Focus on what the sticker depicts (character, object, action, emotion). Be concise and objective.";
function isMinimaxVlmProvider(provider) {
	const normalized = normalizeLowercaseStringOrEmpty(provider);
	return normalized === "minimax" || normalized === "minimax-cn" || normalized === "minimax-portal" || normalized === "minimax-portal-cn";
}
/**
* Describe a sticker image using vision API.
* Auto-detects an available vision provider based on configured API keys.
* Returns null if no vision provider is available.
*/
async function describeStickerImage(params) {
	const { imagePath, cfg, agentDir, agentId } = params;
	const defaultModel = resolveDefaultModelForAgent({
		cfg,
		agentId
	});
	let activeModel = void 0;
	let catalog = [];
	try {
		catalog = await loadModelCatalog({ config: cfg });
		if (modelSupportsVision(findModelInCatalog(catalog, defaultModel.provider, defaultModel.model))) {
			const model = isMinimaxVlmProvider(defaultModel.provider) ? resolveDefaultMediaModel({
				cfg,
				providerId: defaultModel.provider,
				capability: "image",
				includeConfiguredImageModels: false
			}) : defaultModel.model;
			if (model) activeModel = {
				provider: defaultModel.provider,
				model
			};
		}
	} catch {}
	const hasProviderKey = async (provider) => {
		try {
			await resolveApiKeyForProvider({
				provider,
				cfg,
				agentDir
			});
			return true;
		} catch {
			return false;
		}
	};
	const autoProviders = resolveAutoMediaKeyProviders({
		cfg,
		capability: "image"
	});
	const selectCatalogModel = (provider) => {
		const entries = catalog.filter((entry) => normalizeLowercaseStringOrEmpty(entry.provider) === normalizeLowercaseStringOrEmpty(provider) && modelSupportsVision(entry));
		if (entries.length === 0) return;
		const defaultId = resolveDefaultMediaModel({
			cfg,
			providerId: provider,
			capability: "image",
			includeConfiguredImageModels: !isMinimaxVlmProvider(provider)
		});
		const preferred = entries.find((entry) => entry.id === defaultId);
		if (isMinimaxVlmProvider(provider)) return preferred;
		return preferred ?? entries[0];
	};
	let resolved = null;
	if (activeModel && autoProviders.includes(activeModel.provider) && await hasProviderKey(activeModel.provider)) resolved = activeModel;
	if (!resolved) for (const provider of autoProviders) {
		if (!await hasProviderKey(provider)) continue;
		const entry = selectCatalogModel(provider);
		if (entry) {
			resolved = {
				provider,
				model: entry.id
			};
			break;
		}
	}
	if (!resolved) resolved = await resolveAutoImageModel({
		cfg,
		agentDir,
		activeModel
	});
	if (!resolved?.model) {
		logVerbose("telegram: no vision provider available for sticker description");
		return null;
	}
	const { provider, model } = resolved;
	logVerbose(`telegram: describing sticker with ${provider}/${model}`);
	try {
		return (await getTelegramRuntime().mediaUnderstanding.describeImageFileWithModel({
			filePath: imagePath,
			mime: "image/webp",
			cfg,
			agentDir,
			provider,
			model,
			prompt: STICKER_DESCRIPTION_PROMPT,
			maxTokens: 150,
			timeoutMs: 3e4
		})).text ?? null;
	} catch (err) {
		logVerbose(`telegram: failed to describe sticker: ${String(err)}`);
		return null;
	}
}
//#endregion
export { describeStickerImage as t };
