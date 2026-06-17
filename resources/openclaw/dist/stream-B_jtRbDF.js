import { r as createDeepSeekV4OpenAICompatibleThinkingWrapper } from "./provider-stream-shared-BIV_zuwB.js";
import { i as streamWithPayloadPatch } from "./moonshot-thinking-RT-IFIsx.js";
import { r as isOpencodeGoKimiNoReasoningModelId } from "./provider-catalog-D7v8k73t.js";
import { t as stripOpencodeGoKimiReasoningPayload } from "./reasoning-sanitizer-BA49xp2a.js";
//#region extensions/opencode-go/stream.ts
function isOpencodeGoDeepSeekV4ModelId(modelId) {
	return modelId === "deepseek-v4-flash" || modelId === "deepseek-v4-pro";
}
function createOpencodeGoDeepSeekV4Wrapper(baseStreamFn, thinkingLevel) {
	return createDeepSeekV4OpenAICompatibleThinkingWrapper({
		baseStreamFn,
		thinkingLevel,
		shouldPatchModel: (model) => model.provider === "opencode-go" && isOpencodeGoDeepSeekV4ModelId(model.id)
	});
}
function stripReasoningParams(payloadObj) {
	stripOpencodeGoKimiReasoningPayload(payloadObj);
}
function createOpencodeGoKimiNoReasoningWrapper(baseStreamFn) {
	if (!baseStreamFn) return;
	const underlying = baseStreamFn;
	return (model, context, options) => {
		if (model.provider !== "opencode-go" || !isOpencodeGoKimiNoReasoningModelId(model.id)) return underlying(model, context, options);
		return streamWithPayloadPatch(underlying, model, context, options, stripReasoningParams);
	};
}
function createOpencodeGoWrapper(baseStreamFn, thinkingLevel) {
	const kimiWrapped = createOpencodeGoKimiNoReasoningWrapper(baseStreamFn) ?? baseStreamFn;
	return createOpencodeGoDeepSeekV4Wrapper(kimiWrapped, thinkingLevel) ?? kimiWrapped;
}
//#endregion
export { createOpencodeGoKimiNoReasoningWrapper as n, createOpencodeGoWrapper as r, createOpencodeGoDeepSeekV4Wrapper as t };
