import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-mnp54Vah.js";
import { t as createLazyImportLoader } from "./lazy-promise-BONnzNfb.js";
import "./agent-scope-MrLta7Pq.js";
import { c as resolveDefaultAgentId, o as resolveAgentWorkspaceDir, s as resolveDefaultAgentDir } from "./agent-scope-config-CgCYpZfK.js";
import { i as getRuntimeConfig } from "./io-Gi7-pyU-.js";
import "./config-C9RxTsn1.js";
import { o as normalizeProviderId } from "./model-selection-normalize-roKDxQ9_.js";
import "./model-selection-CA_65iXi.js";
import { t as computeBackoff } from "./backoff-S1yazmy1.js";
import { n as discoverModels, t as discoverAuthStorage } from "./agent-model-discovery-BSvavgs4.js";
//#region src/agents/context-cache.ts
/** Process-local model context window cache keyed by model id. */
const MODEL_CONTEXT_TOKEN_CACHE = /* @__PURE__ */ new Map();
/** Looks up cached context-token count for a model id. */
function lookupCachedContextTokens(modelId) {
	if (!modelId) return;
	return MODEL_CONTEXT_TOKEN_CACHE.get(modelId);
}
//#endregion
//#region src/agents/context-runtime-state.ts
const CONTEXT_WINDOW_RUNTIME_STATE_KEY = Symbol.for("openclaw.contextWindowRuntimeState");
/** Shared mutable state for context-window resolution and model config loading. */
const CONTEXT_WINDOW_RUNTIME_STATE = (() => {
	const globalState = globalThis;
	if (!globalState[CONTEXT_WINDOW_RUNTIME_STATE_KEY]) globalState[CONTEXT_WINDOW_RUNTIME_STATE_KEY] = {
		loadPromise: null,
		configuredConfig: void 0,
		configLoadFailures: 0,
		nextConfigLoadAttemptAtMs: 0,
		modelsConfigRuntimeLoader: createLazyImportLoader(() => import("./agents/models-config.runtime.js"))
	};
	return globalState[CONTEXT_WINDOW_RUNTIME_STATE_KEY];
})();
/** Reset context-window runtime state and token cache for isolated tests. */
function resetContextWindowCacheForTest() {
	CONTEXT_WINDOW_RUNTIME_STATE.loadPromise = null;
	CONTEXT_WINDOW_RUNTIME_STATE.configuredConfig = void 0;
	CONTEXT_WINDOW_RUNTIME_STATE.configLoadFailures = 0;
	CONTEXT_WINDOW_RUNTIME_STATE.nextConfigLoadAttemptAtMs = 0;
	CONTEXT_WINDOW_RUNTIME_STATE.modelsConfigRuntimeLoader.clear();
	MODEL_CONTEXT_TOKEN_CACHE.clear();
}
//#endregion
//#region src/agents/context.ts
const ANTHROPIC_GA_1M_MODEL_PREFIXES = [
	"claude-opus-4-8",
	"claude-opus-4.8",
	"claude-opus-4-6",
	"claude-opus-4.6",
	"claude-opus-4-7",
	"claude-opus-4.7",
	"claude-sonnet-4-6",
	"claude-sonnet-4.6"
];
const ANTHROPIC_CONTEXT_1M_TOKENS = 1048576;
const ANTHROPIC_FABLE_CONTEXT_TOKENS = 1e6;
const CONFIG_LOAD_RETRY_POLICY = {
	initialMs: 1e3,
	maxMs: 6e4,
	factor: 2,
	jitter: 0
};
function applyDiscoveredContextWindows(params) {
	for (const model of params.models) {
		if (!model?.id) continue;
		const discoveredContextTokens = typeof model.contextTokens === "number" ? Math.trunc(model.contextTokens) : typeof model.contextWindow === "number" ? Math.trunc(model.contextWindow) : void 0;
		const contextTokens = resolveDiscoveredAnthropicFixedContextWindow(model) ?? discoveredContextTokens;
		if (!contextTokens || contextTokens <= 0) continue;
		const existing = params.cache.get(model.id);
		if (existing === void 0 || contextTokens < existing) params.cache.set(model.id, contextTokens);
	}
}
function applyConfiguredContextWindows(params) {
	const providers = params.modelsConfig?.providers;
	if (!providers || typeof providers !== "object") return;
	for (const provider of Object.values(providers)) {
		if (!Array.isArray(provider?.models)) continue;
		for (const model of provider.models) {
			const modelId = typeof model?.id === "string" ? model.id : void 0;
			const contextTokens = typeof model?.contextTokens === "number" ? model.contextTokens : typeof model?.contextWindow === "number" ? model.contextWindow : typeof provider?.contextTokens === "number" ? provider.contextTokens : typeof provider?.contextWindow === "number" ? provider.contextWindow : void 0;
			if (!modelId || !contextTokens || contextTokens <= 0) continue;
			params.cache.set(modelId, contextTokens);
		}
	}
}
function loadModelsConfigRuntime() {
	return CONTEXT_WINDOW_RUNTIME_STATE.modelsConfigRuntimeLoader.load();
}
function primeConfiguredContextWindows() {
	if (CONTEXT_WINDOW_RUNTIME_STATE.configuredConfig) {
		applyConfiguredContextWindows({
			cache: MODEL_CONTEXT_TOKEN_CACHE,
			modelsConfig: CONTEXT_WINDOW_RUNTIME_STATE.configuredConfig.models
		});
		return CONTEXT_WINDOW_RUNTIME_STATE.configuredConfig;
	}
	if (Date.now() < CONTEXT_WINDOW_RUNTIME_STATE.nextConfigLoadAttemptAtMs) return;
	try {
		const cfg = getRuntimeConfig();
		applyConfiguredContextWindows({
			cache: MODEL_CONTEXT_TOKEN_CACHE,
			modelsConfig: cfg.models
		});
		CONTEXT_WINDOW_RUNTIME_STATE.configuredConfig = cfg;
		CONTEXT_WINDOW_RUNTIME_STATE.configLoadFailures = 0;
		CONTEXT_WINDOW_RUNTIME_STATE.nextConfigLoadAttemptAtMs = 0;
		return cfg;
	} catch {
		CONTEXT_WINDOW_RUNTIME_STATE.configLoadFailures += 1;
		const backoffMs = computeBackoff(CONFIG_LOAD_RETRY_POLICY, CONTEXT_WINDOW_RUNTIME_STATE.configLoadFailures);
		CONTEXT_WINDOW_RUNTIME_STATE.nextConfigLoadAttemptAtMs = Date.now() + backoffMs;
		return;
	}
}
function ensureContextWindowCacheLoaded() {
	if (CONTEXT_WINDOW_RUNTIME_STATE.loadPromise) return CONTEXT_WINDOW_RUNTIME_STATE.loadPromise;
	const cfg = primeConfiguredContextWindows();
	if (!cfg) return Promise.resolve();
	CONTEXT_WINDOW_RUNTIME_STATE.loadPromise = (async () => {
		const agentDir = resolveDefaultAgentDir(cfg);
		const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
		try {
			await (await loadModelsConfigRuntime()).ensureOpenClawModelsJson(cfg, agentDir, { workspaceDir });
		} catch {}
		try {
			const modelRegistry = discoverModels(discoverAuthStorage(agentDir), agentDir, {
				normalizeModels: false,
				workspaceDir
			});
			applyDiscoveredContextWindows({
				cache: MODEL_CONTEXT_TOKEN_CACHE,
				models: typeof modelRegistry.getAvailable === "function" ? modelRegistry.getAvailable() : modelRegistry.getAll()
			});
		} catch {}
		applyConfiguredContextWindows({
			cache: MODEL_CONTEXT_TOKEN_CACHE,
			modelsConfig: cfg.models
		});
	})().catch(() => {});
	return CONTEXT_WINDOW_RUNTIME_STATE.loadPromise;
}
function lookupContextTokens(modelId, options) {
	if (!modelId) return;
	if (options?.skipRuntimeConfigLoad) return lookupCachedContextTokens(modelId);
	if (options?.allowAsyncLoad === false) primeConfiguredContextWindows();
	else ensureContextWindowCacheLoaded();
	return lookupCachedContextTokens(modelId);
}
function resolveProviderModelRef(params) {
	const modelRaw = params.model?.trim();
	if (!modelRaw) return;
	const providerRaw = params.provider?.trim();
	if (providerRaw) {
		const provider = normalizeProviderId(providerRaw);
		if (!provider) return;
		return {
			provider,
			model: modelRaw
		};
	}
	const slash = modelRaw.indexOf("/");
	if (slash <= 0) return;
	const provider = normalizeProviderId(modelRaw.slice(0, slash));
	const model = modelRaw.slice(slash + 1).trim();
	if (!provider || !model) return;
	return {
		provider,
		model
	};
}
function resolveConfiguredProviderContextTokens(cfg, provider, model) {
	const providers = (cfg?.models)?.providers;
	if (!providers) return;
	function readProviderContextTokens(providerConfig) {
		return typeof providerConfig?.contextTokens === "number" ? providerConfig.contextTokens : typeof providerConfig?.contextWindow === "number" ? providerConfig.contextWindow : void 0;
	}
	function findContextTokens(matchProviderId) {
		for (const [providerId, providerConfig] of Object.entries(providers)) {
			if (!matchProviderId(providerId)) continue;
			if (Array.isArray(providerConfig?.models)) for (const m of providerConfig.models) {
				const contextTokens = typeof m?.contextTokens === "number" ? m.contextTokens : typeof m?.contextWindow === "number" ? m.contextWindow : void 0;
				if (typeof m?.id === "string" && m.id === model && typeof contextTokens === "number" && contextTokens > 0) return contextTokens;
			}
			const providerContextTokens = readProviderContextTokens(providerConfig);
			if (typeof providerContextTokens === "number" && providerContextTokens > 0) return providerContextTokens;
		}
	}
	const exactResult = findContextTokens((id) => normalizeLowercaseStringOrEmpty(id) === normalizeLowercaseStringOrEmpty(provider));
	if (exactResult !== void 0) return exactResult;
	const normalizedProvider = normalizeProviderId(provider);
	return findContextTokens((id) => normalizeProviderId(id) === normalizedProvider);
}
function resolveAnthropicFixedContextWindow(provider, model) {
	const modelId = resolveModelFamilyId(model);
	if ((provider === "anthropic" || provider === "anthropic-vertex") && modelId.startsWith("claude-fable-5")) return ANTHROPIC_FABLE_CONTEXT_TOKENS;
	if (provider !== "anthropic" && provider !== "claude-cli") return;
	return ANTHROPIC_GA_1M_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix)) ? ANTHROPIC_CONTEXT_1M_TOKENS : void 0;
}
function resolveDiscoveredAnthropicFixedContextWindow(model) {
	const provider = typeof model.provider === "string" ? normalizeProviderId(model.provider) : void 0;
	const modelId = model.id;
	if (provider) return resolveAnthropicFixedContextWindow(provider, modelId);
	const normalized = normalizeLowercaseStringOrEmpty(modelId);
	const slash = normalized.indexOf("/");
	if (slash < 0) return;
	const inferredProvider = normalizeProviderId(normalized.slice(0, slash));
	const inferredModel = normalized.slice(slash + 1);
	return inferredProvider === "claude-cli" ? resolveAnthropicFixedContextWindow(inferredProvider, inferredModel) : void 0;
}
function resolveModelFamilyId(modelId) {
	const normalized = normalizeLowercaseStringOrEmpty(modelId);
	return normalized.includes("/") ? normalized.split("/").at(-1) ?? normalized : normalized;
}
function resolveContextTokensForModel(params) {
	if (typeof params.contextTokensOverride === "number" && params.contextTokensOverride > 0) return params.contextTokensOverride;
	const ref = resolveProviderModelRef({
		provider: params.provider,
		model: params.model
	});
	const explicitProvider = params.provider?.trim();
	if (ref) {
		if (explicitProvider) {
			const fixedContextWindow = resolveAnthropicFixedContextWindow(ref.provider, ref.model);
			if (fixedContextWindow !== void 0) return fixedContextWindow;
		}
		if (explicitProvider) {
			const configuredWindow = resolveConfiguredProviderContextTokens(params.cfg, explicitProvider, ref.model);
			if (configuredWindow !== void 0) return configuredWindow;
		}
	}
	if (params.provider && ref && !ref.model.includes("/")) {
		const qualifiedResult = lookupContextTokens(`${normalizeProviderId(ref.provider)}/${ref.model}`, {
			allowAsyncLoad: params.allowAsyncLoad,
			skipRuntimeConfigLoad: Boolean(params.cfg)
		});
		if (qualifiedResult !== void 0) return qualifiedResult;
	}
	const bareResult = lookupContextTokens(params.model, {
		allowAsyncLoad: params.allowAsyncLoad,
		skipRuntimeConfigLoad: Boolean(params.cfg)
	});
	if (bareResult !== void 0) return bareResult;
	if (!params.provider && ref && !ref.model.includes("/")) {
		const qualifiedResult = lookupContextTokens(`${normalizeProviderId(ref.provider)}/${ref.model}`, {
			allowAsyncLoad: params.allowAsyncLoad,
			skipRuntimeConfigLoad: Boolean(params.cfg)
		});
		if (qualifiedResult !== void 0) return qualifiedResult;
	}
	return params.fallbackContextTokens;
}
//#endregion
export { ensureContextWindowCacheLoaded as a, resetContextWindowCacheForTest as c, applyDiscoveredContextWindows as i, ANTHROPIC_FABLE_CONTEXT_TOKENS as n, lookupContextTokens as o, applyConfiguredContextWindows as r, resolveContextTokensForModel as s, ANTHROPIC_CONTEXT_1M_TOKENS as t };
