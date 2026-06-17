import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-mnp54Vah.js";
import "./string-coerce-runtime-CEGJWkQ_.js";
//#region extensions/github-copilot/replay-policy.ts
function buildGithubCopilotReplayPolicy(modelId) {
	return normalizeLowercaseStringOrEmpty(modelId).includes("claude") ? { dropThinkingBlocks: true } : {};
}
//#endregion
export { buildGithubCopilotReplayPolicy as t };
