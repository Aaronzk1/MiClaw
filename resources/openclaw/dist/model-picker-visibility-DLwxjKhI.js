import { i as normalizeProviderId } from "./provider-id-Dq06Bcx6.js";
import { r as listCliRuntimeProviderIds } from "./cli-backends-CcaQo9wE.js";
import { i as isCliRuntimeProvider } from "./model-runtime-aliases-6XX4uD6a.js";
//#region src/agents/model-picker-visibility.ts
/**
* Filters provider/model refs for model picker visibility.
*/
const RETIRED_MODEL_PICKER_PROVIDERS = new Set(["codex", "codex-cli"]);
/** Creates a provider visibility predicate for model picker rendering. */
function createModelPickerVisibleProviderPredicate(params = {}) {
	const cliRuntimeProviders = new Set(listCliRuntimeProviderIds({
		config: params.config,
		env: params.env,
		includeSetupRegistry: params.includeSetupRegistry ?? false
	}));
	return (provider) => {
		const normalized = normalizeProviderId(provider);
		return !RETIRED_MODEL_PICKER_PROVIDERS.has(normalized) && !cliRuntimeProviders.has(normalized);
	};
}
/** Returns whether a provider id should appear in the model picker. */
function isModelPickerVisibleProvider(provider) {
	const normalized = normalizeProviderId(provider);
	return !RETIRED_MODEL_PICKER_PROVIDERS.has(normalized) && !isCliRuntimeProvider(normalized, { includeSetupRegistry: true });
}
//#endregion
export { isModelPickerVisibleProvider as n, createModelPickerVisibleProviderPredicate as t };
