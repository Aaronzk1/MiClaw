import { a as resolveAgentModelTimeoutMsValue, i as resolveAgentModelPrimaryValue, r as resolveAgentModelFallbackValues } from "./model-input-B2zxl6MM.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-mDjiWzE5.js";
import { i as ensureAuthProfileStoreWithoutExternalProfiles, n as ensureAuthProfileStore } from "./store-C8spD0DG.js";
import { t as hasAnyAuthProfileStoreSource } from "./source-check-DlvZuh4h.js";
import "./auth-profiles-84rzaGag.js";
import { r as externalCliDiscoveryForProviderAuth } from "./external-cli-discovery-Cr-vJMRB.js";
import { n as listProfilesForProvider } from "./profile-list-DI8_o0Rw.js";
import { g as resolveConfiguredModelRef } from "./model-selection-shared-b32cUYts.js";
import "./model-selection-CA_65iXi.js";
import { t as resolveEnvApiKey } from "./model-auth-env-O5hF4UJr.js";
import { u as hasUsableCustomProviderApiKey } from "./model-auth-DVfmdW0b.js";
//#region src/agents/tools/model-config.helpers.ts
/**
* Tool model config and auth helpers.
*
* Model-backed tools use this module to choose provider/model refs and check
* whether candidate providers have usable auth before exposing defaults.
*/
/** Returns whether a tool model config contains a primary or fallback model ref. */
function hasToolModelConfig(model) {
	return Boolean(model?.primary?.trim() || (model?.fallbacks ?? []).some((entry) => entry.trim().length > 0));
}
/** Resolves the configured default model ref, falling back to OpenClaw defaults. */
function resolveDefaultModelRef(cfg) {
	if (cfg) {
		const resolved = resolveConfiguredModelRef({
			cfg,
			defaultProvider: DEFAULT_PROVIDER,
			defaultModel: DEFAULT_MODEL
		});
		return {
			provider: resolved.provider,
			model: resolved.model
		};
	}
	return {
		provider: DEFAULT_PROVIDER,
		model: DEFAULT_MODEL
	};
}
/** Returns whether a provider has env, profile, or external CLI auth available. */
function hasAuthForProvider(params) {
	if (resolveEnvApiKey(params.provider)?.apiKey) return true;
	return hasAuthProfileForProvider({
		...params,
		includeExternalCli: true
	});
}
/** Returns whether an auth profile exists for a provider, optionally filtered by type. */
function hasAuthProfileForProvider(params) {
	let store = params.authStore;
	if (!store) {
		const agentDir = params.agentDir?.trim();
		if (!agentDir) return false;
		if (!hasAnyAuthProfileStoreSource(agentDir)) return false;
		store = params.includeExternalCli ? ensureAuthProfileStore(agentDir, { externalCli: externalCliDiscoveryForProviderAuth({ provider: params.provider }) }) : ensureAuthProfileStoreWithoutExternalProfiles(agentDir, { allowKeychainPrompt: false });
	}
	const profileIds = listProfilesForProvider(store, params.provider);
	if (!params.type) return profileIds.length > 0;
	return profileIds.some((profileId) => store.profiles[profileId]?.type === params.type);
}
/** Returns whether a provider can be used by a model-backed tool. */
function hasProviderAuthForTool(params) {
	if (hasAuthForProvider({
		provider: params.provider,
		agentDir: params.agentDir,
		authStore: params.authStore
	})) return true;
	return hasUsableCustomProviderApiKey(params.cfg, params.provider);
}
/** Normalizes agent tool model config into a compact runtime shape. */
function coerceToolModelConfig(model) {
	const primary = resolveAgentModelPrimaryValue(model);
	const fallbacks = resolveAgentModelFallbackValues(model);
	const timeoutMs = resolveAgentModelTimeoutMsValue(model);
	return {
		...primary?.trim() ? { primary: primary.trim() } : {},
		...fallbacks.length > 0 ? { fallbacks } : {},
		...timeoutMs !== void 0 ? { timeoutMs } : {}
	};
}
/** Builds a tool model config from configured auth-aware candidate model refs. */
function buildToolModelConfigFromCandidates(params) {
	if (hasToolModelConfig(params.explicit)) return params.explicit;
	const deduped = [];
	for (const candidate of params.candidates) {
		const trimmed = candidate?.trim();
		if (!trimmed || !trimmed.includes("/")) continue;
		const provider = trimmed.slice(0, trimmed.indexOf("/")).trim();
		const providerConfigured = params.isProviderConfigured?.(provider) ?? hasProviderAuthForTool({
			provider,
			cfg: params.cfg,
			workspaceDir: params.workspaceDir,
			agentDir: params.agentDir,
			authStore: params.authStore
		});
		if (!provider || !providerConfigured) continue;
		if (!deduped.includes(trimmed)) deduped.push(trimmed);
	}
	if (deduped.length === 0) return null;
	return {
		primary: deduped[0],
		...deduped.length > 1 ? { fallbacks: deduped.slice(1) } : {},
		...params.explicit.timeoutMs !== void 0 ? { timeoutMs: params.explicit.timeoutMs } : {}
	};
}
//#endregion
export { hasProviderAuthForTool as a, hasAuthProfileForProvider as i, coerceToolModelConfig as n, hasToolModelConfig as o, hasAuthForProvider as r, resolveDefaultModelRef as s, buildToolModelConfigFromCandidates as t };
