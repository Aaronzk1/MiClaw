import { a as createGoogleThinkingStreamWrapper } from "./provider-stream-shared-BIV_zuwB.js";
import { a as buildProviderReplayFamilyHooks } from "./provider-model-shared-D-lyTLvb.js";
import { n as buildProviderToolCompatFamilyHooks } from "./provider-tools-VmwDm8UA.js";
import "./thinking-api-DKybzEKY.js";
import { u as resolveGoogleThinkingProfile } from "./provider-policy-CT7vRcoH.js";
//#region extensions/google/provider-hooks.ts
const GOOGLE_GEMINI_PROVIDER_HOOKS = {
	...buildProviderReplayFamilyHooks({ family: "google-gemini" }),
	...buildProviderToolCompatFamilyHooks("gemini"),
	resolveThinkingProfile: (context) => resolveGoogleThinkingProfile(context),
	wrapStreamFn: createGoogleThinkingStreamWrapper
};
//#endregion
export { GOOGLE_GEMINI_PROVIDER_HOOKS as t };
