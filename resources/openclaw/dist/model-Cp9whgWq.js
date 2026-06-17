import { c as normalizeOptionalString, s as normalizeOptionalLowercaseString } from "./string-coerce-mnp54Vah.js";
import { p as finiteSecondsToTimerSafeMilliseconds } from "./number-coercion-CJQ8TR--.js";
import { i as normalizeProviderId } from "./provider-id-Dq06Bcx6.js";
import { i as loadPluginManifest } from "./manifest-BcY4wyAU.js";
import { t as loadPluginManifestRegistry } from "./manifest-registry-BywZIeAq.js";
import "./agent-scope-MrLta7Pq.js";
import { s as resolveDefaultAgentDir } from "./agent-scope-config-CgCYpZfK.js";
import { i as listOpenAIAuthProfileProvidersForAgentRuntime } from "./openai-routing-DXJmS9CT.js";
import { t as planManifestModelCatalogRows } from "./manifest-planner-BRQyTcMi.js";
import "./defaults-mDjiWzE5.js";
import { r as hasAnyRuntimeAuthProfileStoreSource } from "./runtime-snapshots-CGKcj2Tz.js";
import { n as ensureAuthProfileStore } from "./store-C8spD0DG.js";
import { B as runProviderDynamicModel, U as shouldPreferProviderRuntimeResolvedModel, _ as normalizeProviderTransportWithPlugin, h as normalizeProviderResolvedModelWithPlugin, r as applyProviderResolvedTransportWithPlugin, s as buildProviderUnknownModelHintWithPlugin, v as prepareProviderDynamicModel } from "./provider-runtime-CJtW0nDR.js";
import "./auth-profiles-84rzaGag.js";
import { i as resolveAuthProfileOrder } from "./order-CdBVYd7c.js";
import { t as listOpenClawPluginManifestMetadata } from "./manifest-metadata-scan-B1LSltL_.js";
import { n as attachModelProviderRequestTransport, s as resolveProviderRequestConfig, u as sanitizeConfiguredModelProviderRequest } from "./provider-request-config-0Zg8QIAI.js";
import { n as resolveModelWorkspaceDir, t as resolveModelPluginMetadataSnapshot } from "./model-discovery-context-DmaLjfYx.js";
import { i as normalizeStaticProviderModelId, n as modelKey } from "./model-ref-shared-CqcindZs.js";
import { n as findNormalizedProviderValue, o as normalizeProviderId$1 } from "./model-selection-normalize-roKDxQ9_.js";
import { p as isSecretRefHeaderValueMarker } from "./model-auth-markers-Sq8HdQFX.js";
import "./model-selection-CA_65iXi.js";
import { s as listPluginModelCatalogFiles } from "./plugin-model-catalog-C26wDCJp.js";
import { bt as AuthStorage, pt as ModelRegistry } from "./sessions-BTpdzjUa.js";
import { r as resolveRuntimeSyntheticAuthProviderRefs, t as resolveRuntimeExternalAuthProviderRefs } from "./synthetic-auth.runtime.js";
import { a as normalizeModelCompat } from "./provider-model-compat-DhKi-Qv5.js";
import { n as discoverModels, t as discoverAuthStorage } from "./agent-model-discovery-BSvavgs4.js";
import { t as attachModelProviderLocalService } from "./provider-local-service-ZBHHbJ8A.js";
import { a as shouldUnconditionallySuppress, n as buildSuppressedBuiltInModelError, r as shouldSuppressBuiltInModel } from "./model-suppression-DKe1ELlS.js";
import { n as normalizeGoogleApiBaseUrl } from "./google-api-base-url-UBNiBOzj.js";
import { statSync } from "node:fs";
import path from "node:path";
//#region src/agents/model-alias-lines.ts
/**
* Formats configured model aliases for prompt-visible model guidance.
*/
/** Builds deterministic prompt lines for configured model aliases. */
function buildModelAliasLines(cfg) {
	const models = cfg?.agents?.defaults?.models ?? {};
	const entries = [];
	for (const [keyRaw, entryRaw] of Object.entries(models)) {
		const model = normalizeOptionalString(keyRaw) ?? "";
		if (!model) continue;
		const alias = normalizeOptionalString(entryRaw?.alias) ?? "";
		if (!alias) continue;
		entries.push({
			alias,
			model
		});
	}
	return entries.toSorted((a, b) => a.alias.localeCompare(b.alias)).map((entry) => `- ${entry.alias}: ${entry.model}`);
}
//#endregion
//#region src/agents/embedded-agent-runner/model-discovery-cache.ts
/**
* Discovers cached model/provider state from configured agent stores.
*/
const MAX_DISCOVERY_STORE_CACHE_ENTRIES = 64;
const DISCOVERY_STORE_CACHE = /* @__PURE__ */ new Map();
/** Returns the small file metadata tuple used to invalidate cached discovery snapshots. */
function fileFingerprint(pathname) {
	try {
		const stat = statSync(pathname);
		return Number.isFinite(stat.mtimeMs) ? {
			mtimeMs: stat.mtimeMs,
			size: stat.size
		} : null;
	} catch {
		return null;
	}
}
function normalizeCacheDir(dirname) {
	return dirname ? path.resolve(dirname) : void 0;
}
function authFingerprint(agentDir) {
	return {
		authProfilesSqlite: fileFingerprint(path.join(agentDir, "openclaw-agent.sqlite")),
		authProfilesSqliteWal: fileFingerprint(path.join(agentDir, "openclaw-agent.sqlite-wal"))
	};
}
function pluginModelCatalogFingerprint(agentDir) {
	return listPluginModelCatalogFiles(agentDir).map((catalogFile) => [catalogFile.relativePath, fileFingerprint(catalogFile.path)]);
}
function discoveryFingerprint(params) {
	const inheritedAuthDir = params.inheritedAuthDir && params.inheritedAuthDir !== params.agentDir ? params.inheritedAuthDir : void 0;
	return JSON.stringify({
		agentDir: params.agentDir,
		inheritedAuthDir,
		localAuth: authFingerprint(params.agentDir),
		inheritedAuth: inheritedAuthDir ? authFingerprint(inheritedAuthDir) : void 0,
		modelsJson: fileFingerprint(path.join(params.agentDir, "models.json")),
		pluginMetadata: pluginMetadataFingerprint(params.pluginMetadataSnapshot),
		pluginModelCatalogs: pluginModelCatalogFingerprint(params.agentDir)
	});
}
function hasRuntimePluginAuthSources() {
	return resolveRuntimeSyntheticAuthProviderRefs().length > 0 || resolveRuntimeExternalAuthProviderRefs().length > 0;
}
function pruneDiscoveryStoreCache() {
	if (DISCOVERY_STORE_CACHE.size <= MAX_DISCOVERY_STORE_CACHE_ENTRIES) return;
	const overflow = DISCOVERY_STORE_CACHE.size - MAX_DISCOVERY_STORE_CACHE_ENTRIES;
	const oldestKeys = [...DISCOVERY_STORE_CACHE.entries()].toSorted((left, right) => left[1].lastUsedAt - right[1].lastUsedAt).slice(0, overflow).map(([key]) => key);
	for (const key of oldestKeys) DISCOVERY_STORE_CACHE.delete(key);
}
function resolvePluginMetadataSnapshotForDiscovery(options) {
	return resolveModelPluginMetadataSnapshot({
		...options.config ? { config: options.config } : {},
		...options.workspaceDir ? { workspaceDir: options.workspaceDir } : {},
		useRuntimeConfig: options.config === void 0
	});
}
function pluginMetadataFingerprint(snapshot) {
	return {
		configFingerprint: snapshot?.configFingerprint,
		policyHash: snapshot?.policyHash,
		workspaceDir: snapshot?.workspaceDir
	};
}
function discoverFreshAgentStores(agentDir, options, pluginMetadataSnapshot) {
	const authStorage = discoverAuthStorage(agentDir);
	return {
		authStorage,
		modelRegistry: discoverModels(authStorage, agentDir, {
			...options.config ? { config: options.config } : {},
			...pluginMetadataSnapshot ? { pluginMetadataSnapshot } : {},
			...options.workspaceDir ? { workspaceDir: options.workspaceDir } : {}
		})
	};
}
/** Discovers auth/model stores, reusing file-backed snapshots until their inputs change. */
function discoverCachedAgentStores(options) {
	const agentDir = normalizeCacheDir(options.agentDir) ?? options.agentDir;
	const inheritedAuthDir = normalizeCacheDir(options.inheritedAuthDir ?? resolveDefaultAgentDir({}));
	if (hasAnyRuntimeAuthProfileStoreSource(agentDir) || hasRuntimePluginAuthSources()) return discoverFreshAgentStores(agentDir, options, resolvePluginMetadataSnapshotForDiscovery(options));
	const pluginMetadataSnapshot = resolvePluginMetadataSnapshotForDiscovery(options);
	const cacheKey = JSON.stringify({
		agentDir,
		inheritedAuthDir
	});
	const fingerprint = discoveryFingerprint({
		agentDir,
		inheritedAuthDir,
		pluginMetadataSnapshot
	});
	const cached = DISCOVERY_STORE_CACHE.get(cacheKey);
	if (cached?.fingerprint === fingerprint) {
		cached.lastUsedAt = Date.now();
		return {
			authStorage: cached.authStorage,
			modelRegistry: cached.modelRegistry
		};
	}
	const stores = discoverFreshAgentStores(agentDir, options, pluginMetadataSnapshot);
	DISCOVERY_STORE_CACHE.set(cacheKey, {
		authStorage: stores.authStorage,
		fingerprint,
		lastUsedAt: Date.now(),
		modelRegistry: stores.modelRegistry
	});
	pruneDiscoveryStoreCache();
	return stores;
}
//#endregion
//#region src/agents/embedded-agent-runner/model.inline-provider.ts
/**
* Converts inline provider model config into runtime model definitions.
*/
/** Returns a supported transport API id from raw config values. */
function normalizeResolvedTransportApi(api) {
	switch (api) {
		case "anthropic-messages":
		case "bedrock-converse-stream":
		case "github-copilot":
		case "google-generative-ai":
		case "google-vertex":
		case "ollama":
		case "openai-chatgpt-responses":
		case "openai-completions":
		case "openai-responses":
		case "azure-openai-responses": return api;
		default: return;
	}
}
/** Sanitizes configured provider/model headers before they enter runtime model metadata. */
function sanitizeModelHeaders(headers, opts) {
	if (!headers || typeof headers !== "object" || Array.isArray(headers)) return;
	const next = {};
	for (const [headerName, headerValue] of Object.entries(headers)) {
		if (typeof headerValue !== "string") continue;
		if (opts?.stripSecretRefMarkers && isSecretRefHeaderValueMarker(headerValue)) continue;
		next[headerName] = headerValue;
	}
	return Object.keys(next).length > 0 ? next : void 0;
}
function isLegacyFoundryVisionModelCandidate(params) {
	if (normalizeOptionalLowercaseString(params.provider) !== "microsoft-foundry") return false;
	return [params.modelId, params.modelName].filter((value) => typeof value === "string").map((value) => normalizeOptionalLowercaseString(value)).filter((value) => Boolean(value)).some((candidate) => candidate.startsWith("gpt-") || candidate.startsWith("o1") || candidate.startsWith("o3") || candidate.startsWith("o4") || candidate === "computer-use-preview");
}
/** Resolves model input modalities with Foundry legacy vision-model compatibility. */
function resolveProviderModelInput(params) {
	const resolvedInput = Array.isArray(params.input) ? params.input : params.fallbackInput;
	const normalizedInput = Array.isArray(resolvedInput) ? resolvedInput.filter((item) => item === "text" || item === "image") : [];
	if (normalizedInput.length > 0 && !normalizedInput.includes("image") && isLegacyFoundryVisionModelCandidate(params)) return ["text", "image"];
	return normalizedInput.length > 0 ? normalizedInput : ["text"];
}
function resolveInlineProviderTransport(params) {
	const api = normalizeResolvedTransportApi(params.api);
	return {
		api,
		baseUrl: api === "google-generative-ai" ? normalizeGoogleApiBaseUrl(params.baseUrl) : params.baseUrl
	};
}
/** Builds runtime model records from inline provider config, inheriting provider-level defaults. */
function buildInlineProviderModels(providers) {
	return Object.entries(providers).flatMap(([providerId, entry]) => {
		const trimmed = providerId.trim();
		if (!trimmed) return [];
		const providerHeaders = sanitizeModelHeaders(entry?.headers, { stripSecretRefMarkers: true });
		const providerRequest = sanitizeConfiguredModelProviderRequest(entry?.request);
		return (entry?.models ?? []).map((model) => {
			const transport = resolveInlineProviderTransport({
				api: model.api ?? entry?.api,
				baseUrl: model.baseUrl ?? entry?.baseUrl
			});
			const modelHeaders = sanitizeModelHeaders(model.headers, { stripSecretRefMarkers: true });
			const requestConfig = resolveProviderRequestConfig({
				provider: trimmed,
				api: transport.api ?? model.api,
				baseUrl: transport.baseUrl,
				providerHeaders,
				modelHeaders,
				authHeader: entry?.authHeader,
				request: providerRequest,
				capability: "llm",
				transport: "stream"
			});
			return attachModelProviderLocalService(attachModelProviderRequestTransport({
				...model,
				contextWindow: model.contextWindow ?? entry?.contextWindow,
				contextTokens: model.contextTokens ?? entry?.contextTokens,
				maxTokens: model.maxTokens ?? entry?.maxTokens,
				input: resolveProviderModelInput({
					provider: trimmed,
					modelId: model.id,
					modelName: model.name,
					input: model.input
				}),
				provider: trimmed,
				baseUrl: requestConfig.baseUrl ?? transport.baseUrl,
				api: requestConfig.api ?? model.api,
				headers: requestConfig.headers
			}, providerRequest), entry?.localService);
		});
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/model.provider-normalization.ts
/**
* Applies provider compatibility normalization to a resolved model record.
*/
function normalizeResolvedProviderModel(params) {
	return normalizeModelCompat(params.model);
}
//#endregion
//#region src/agents/embedded-agent-runner/model.static-catalog.ts
/**
* Resolves bundled plugin static model-catalog rows into runtime model records.
*/
function rowMatchesModel(params) {
	const normalizedProvider = normalizeProviderId(params.provider);
	if (normalizeProviderId(params.row.provider) !== normalizedProvider) return false;
	return normalizeStaticProviderModelId(normalizedProvider, params.row.id).trim().toLowerCase() === normalizeStaticProviderModelId(normalizedProvider, params.modelId).trim().toLowerCase();
}
function normalizeStaticCatalogInput(input) {
	const normalizedInput = input.filter((item) => item === "text" || item === "image");
	return normalizedInput.length > 0 ? normalizedInput : ["text"];
}
function normalizeStaticCatalogCost(cost) {
	return {
		input: cost?.input ?? 0,
		output: cost?.output ?? 0,
		cacheRead: cost?.cacheRead ?? 0,
		cacheWrite: cost?.cacheWrite ?? 0
	};
}
/** Converts a normalized catalog row into the provider runtime model shape. */
function modelFromStaticCatalogRow(row) {
	return {
		id: row.id,
		name: row.name || row.id,
		provider: row.provider,
		api: row.api ?? "openai-responses",
		baseUrl: row.baseUrl ?? "",
		reasoning: row.reasoning,
		input: normalizeStaticCatalogInput(row.input),
		cost: normalizeStaticCatalogCost(row.cost),
		contextWindow: row.contextWindow ?? 2e5,
		contextTokens: row.contextTokens,
		maxTokens: row.maxTokens ?? 2e5,
		headers: row.headers,
		compat: row.compat,
		mediaInput: row.mediaInput
	};
}
function listBundledStaticCatalogPlugins(env) {
	return listOpenClawPluginManifestMetadata(env).flatMap((record) => {
		if (record.origin !== "bundled") return [];
		const loaded = loadPluginManifest(record.pluginDir);
		if (!loaded.ok || !loaded.manifest.modelCatalog) return [];
		return [{
			id: loaded.manifest.id,
			providers: loaded.manifest.providers,
			modelCatalog: loaded.manifest.modelCatalog
		}];
	});
}
function resolveManifestModelCatalogProviderAlias(params) {
	const provider = normalizeProviderId(params.provider);
	if (!provider) return;
	const targets = /* @__PURE__ */ new Set();
	for (const plugin of params.plugins) for (const [rawAlias, alias] of Object.entries(plugin.modelCatalog?.aliases ?? {})) {
		const normalizedAlias = normalizeProviderId(rawAlias);
		const normalizedTarget = normalizeProviderId(alias.provider);
		if (normalizedAlias === provider && normalizedTarget && plugin.providers.some((providerId) => normalizeProviderId(providerId) === normalizedTarget)) targets.add(normalizedTarget);
	}
	return targets.size === 1 ? [...targets][0] : void 0;
}
/** Resolves a provider alias from plugin model-catalog metadata when the alias is unambiguous. */
function canonicalizeManifestModelCatalogProviderAlias(params) {
	const provider = normalizeProviderId(params.provider);
	if (!provider) return params.provider;
	return resolveManifestModelCatalogProviderAlias({
		provider,
		plugins: loadPluginManifestRegistry({
			config: params.cfg,
			workspaceDir: params.workspaceDir,
			env: params.env ?? process.env
		}).plugins
	}) ?? params.provider;
}
/** Returns whether a bundled static catalog asks runtime discovery to augment its rows. */
function bundledStaticCatalogProviderUsesRuntimeAugment(params) {
	const provider = normalizeProviderId(params.provider);
	if (!provider) return false;
	return listBundledStaticCatalogPlugins(params.env ?? process.env).some((plugin) => {
		const catalog = plugin.modelCatalog;
		if (catalog?.runtimeAugment !== true) return false;
		return Object.keys(catalog.providers ?? {}).some((candidate) => normalizeProviderId(candidate) === provider) || Object.keys(catalog.aliases ?? {}).some((candidate) => normalizeProviderId(candidate) === provider);
	});
}
/** Resolves one bundled static-catalog model row for provider/model lookup. */
function resolveBundledStaticCatalogModel(params) {
	const provider = normalizeProviderId(params.provider);
	if (!provider || !params.modelId.trim()) return;
	const bundledStaticPlugins = listBundledStaticCatalogPlugins(params.env ?? process.env);
	if (bundledStaticPlugins.length === 0) return;
	const plan = planManifestModelCatalogRows({
		registry: { plugins: bundledStaticPlugins },
		providerFilter: provider
	});
	for (const entry of plan.entries) {
		if (entry.discovery !== "static" && !(params.includeRuntimeDiscovery && entry.discovery === "runtime")) continue;
		const row = entry.rows.find((candidate) => rowMatchesModel({
			row: candidate,
			provider,
			modelId: params.modelId
		}));
		if (row) return modelFromStaticCatalogRow(row);
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/model.ts
/**
* Resolves embedded-agent provider/model selections from config, registry, and catalogs.
*/
const TARGET_PROVIDER_RUNTIME_HOOKS = {
	buildProviderUnknownModelHintWithPlugin,
	prepareProviderDynamicModel,
	runProviderDynamicModel,
	shouldPreferProviderRuntimeResolvedModel,
	normalizeProviderResolvedModelWithPlugin,
	applyProviderResolvedTransportWithPlugin: () => void 0,
	normalizeProviderTransportWithPlugin: () => void 0
};
const DEFAULT_PROVIDER_RUNTIME_HOOKS = {
	...TARGET_PROVIDER_RUNTIME_HOOKS,
	applyProviderResolvedTransportWithPlugin,
	normalizeProviderTransportWithPlugin
};
const STATIC_PROVIDER_RUNTIME_HOOKS = {
	applyProviderResolvedTransportWithPlugin: () => void 0,
	buildProviderUnknownModelHintWithPlugin: () => void 0,
	prepareProviderDynamicModel: async () => {},
	runProviderDynamicModel: () => void 0,
	normalizeProviderResolvedModelWithPlugin: () => void 0,
	normalizeProviderTransportWithPlugin: () => void 0
};
const SKIP_AGENT_DISCOVERY_PROVIDER_RUNTIME_HOOKS = { ...TARGET_PROVIDER_RUNTIME_HOOKS };
function createEmptyAgentDiscoveryStores() {
	const authStorage = typeof AuthStorage.inMemory === "function" ? AuthStorage.inMemory({}) : AuthStorage.create();
	return {
		authStorage,
		modelRegistry: typeof ModelRegistry.inMemory === "function" ? ModelRegistry.inMemory(authStorage) : ModelRegistry.create(authStorage)
	};
}
function resolveRuntimeHooks(params) {
	if (params?.skipProviderRuntimeHooks) return STATIC_PROVIDER_RUNTIME_HOOKS;
	if (params?.runtimeHooks) return params.runtimeHooks;
	if (params?.skipAgentDiscovery) return SKIP_AGENT_DISCOVERY_PROVIDER_RUNTIME_HOOKS;
	return DEFAULT_PROVIDER_RUNTIME_HOOKS;
}
function discoverCachedAgentStoresForAgent(resolvedAgentDir, cfg, workspaceDir) {
	return discoverCachedAgentStores({
		agentDir: resolvedAgentDir,
		...cfg ? { config: cfg } : {},
		inheritedAuthDir: resolveDefaultAgentDir(cfg ?? {}),
		...workspaceDir ? { workspaceDir } : {}
	});
}
function canonicalizeLegacyResolvedModel(params) {
	if (normalizeProviderId$1(params.provider) !== "openai" || params.model.id.trim().toLowerCase() !== "gpt-5.4-codex") return params.model;
	return {
		...params.model,
		id: "gpt-5.4",
		name: params.model.name.trim().toLowerCase() === "gpt-5.4-codex" ? "gpt-5.4" : params.model.name
	};
}
function applyResolvedTransportFallback(params) {
	const normalized = params.runtimeHooks.normalizeProviderTransportWithPlugin({
		provider: params.provider,
		config: params.cfg,
		workspaceDir: params.workspaceDir,
		modelId: params.model.id,
		context: {
			config: params.cfg,
			workspaceDir: params.workspaceDir,
			provider: params.provider,
			modelId: params.model.id,
			api: params.model.api,
			baseUrl: params.model.baseUrl
		}
	});
	if (!normalized) return;
	const nextApi = normalizeResolvedTransportApi(normalized.api) ?? params.model.api;
	const nextBaseUrl = normalized.baseUrl ?? params.model.baseUrl;
	if (nextApi === params.model.api && nextBaseUrl === params.model.baseUrl) return;
	return {
		...params.model,
		api: nextApi,
		baseUrl: nextBaseUrl
	};
}
function normalizeResolvedModel(params) {
	const normalizeModelCost = (cost) => {
		if (!cost || typeof cost !== "object" || Array.isArray(cost)) return {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0
		};
		const record = cost;
		const input = typeof record.input === "number" && Number.isFinite(record.input) ? record.input : 0;
		const output = typeof record.output === "number" && Number.isFinite(record.output) ? record.output : 0;
		const cacheRead = typeof record.cacheRead === "number" && Number.isFinite(record.cacheRead) ? record.cacheRead : 0;
		const cacheWrite = typeof record.cacheWrite === "number" && Number.isFinite(record.cacheWrite) ? record.cacheWrite : 0;
		if (input === record.input && output === record.output && cacheRead === record.cacheRead && cacheWrite === record.cacheWrite) return record;
		return {
			...cost,
			input,
			output,
			cacheRead,
			cacheWrite
		};
	};
	const normalizedInputModel = {
		...params.model,
		input: resolveProviderModelInput({
			provider: params.provider,
			modelId: params.model.id,
			modelName: params.model.name,
			input: params.model.input
		}),
		cost: normalizeModelCost(params.model.cost)
	};
	const runtimeHooks = params.runtimeHooks ?? DEFAULT_PROVIDER_RUNTIME_HOOKS;
	const pluginNormalized = runtimeHooks.normalizeProviderResolvedModelWithPlugin({
		provider: params.provider,
		config: params.cfg,
		workspaceDir: params.workspaceDir,
		context: {
			config: params.cfg,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir,
			provider: params.provider,
			modelId: normalizedInputModel.id,
			model: normalizedInputModel
		}
	});
	const fallbackTransportNormalized = runtimeHooks.applyProviderResolvedTransportWithPlugin?.({
		provider: params.provider,
		config: params.cfg,
		workspaceDir: params.workspaceDir,
		context: {
			config: params.cfg,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir,
			provider: params.provider,
			modelId: normalizedInputModel.id,
			model: pluginNormalized ?? normalizedInputModel
		}
	}) ?? applyResolvedTransportFallback({
		provider: params.provider,
		cfg: params.cfg,
		workspaceDir: params.workspaceDir,
		runtimeHooks,
		model: pluginNormalized ?? normalizedInputModel
	});
	return canonicalizeLegacyResolvedModel({
		provider: params.provider,
		model: normalizeResolvedProviderModel({
			provider: params.provider,
			model: fallbackTransportNormalized ?? pluginNormalized ?? normalizedInputModel
		})
	});
}
function resolveProviderTransport(params) {
	const normalized = (params.runtimeHooks ?? DEFAULT_PROVIDER_RUNTIME_HOOKS).normalizeProviderTransportWithPlugin({
		provider: params.provider,
		...params.modelId ? { modelId: params.modelId } : {},
		config: params.cfg,
		workspaceDir: params.workspaceDir,
		context: {
			config: params.cfg,
			workspaceDir: params.workspaceDir,
			provider: params.provider,
			...params.modelId ? { modelId: params.modelId } : {},
			api: params.api,
			baseUrl: params.baseUrl
		}
	});
	return {
		api: normalizeResolvedTransportApi(normalized?.api ?? params.api),
		baseUrl: normalized?.baseUrl ?? params.baseUrl
	};
}
function resolveConfiguredProviderDefaultApi(params) {
	const { providerConfig } = params;
	const explicit = normalizeResolvedTransportApi(providerConfig?.api);
	if (explicit) return explicit;
	if (!providerConfig?.baseUrl) return;
	return resolveProviderTransport({
		provider: params.provider,
		api: void 0,
		baseUrl: providerConfig.baseUrl,
		cfg: params.cfg,
		workspaceDir: params.workspaceDir,
		runtimeHooks: params.runtimeHooks
	}).api ?? "openai-completions";
}
function resolveProviderRequestTimeoutMs(timeoutSeconds) {
	return finiteSecondsToTimerSafeMilliseconds(timeoutSeconds, { floorSeconds: true });
}
function mergeModelMediaInput(base, override) {
	if (!base) return override;
	if (!override) return base;
	return {
		...base,
		...override,
		image: base.image || override.image ? {
			...base.image,
			...override.image
		} : void 0
	};
}
function matchesProviderScopedModelId(params) {
	const { candidateId, provider, modelId } = params;
	if (candidateId === modelId) return true;
	const slashIndex = candidateId?.indexOf("/") ?? -1;
	if (!candidateId || slashIndex <= 0) return false;
	const candidateProvider = candidateId.slice(0, slashIndex);
	return candidateId.slice(slashIndex + 1) === modelId && normalizeProviderId$1(candidateProvider) === normalizeProviderId$1(provider);
}
function findInlineModelMatch(params) {
	const matchesModelId = (entry) => matchesProviderScopedModelId({
		candidateId: entry.id,
		provider: entry.provider,
		modelId: params.modelId
	});
	const inlineModels = buildInlineProviderModels(params.providers);
	const exact = inlineModels.find((entry) => entry.provider === params.provider && matchesModelId(entry));
	if (exact) return exact;
	const normalizedProvider = normalizeProviderId$1(params.provider);
	return inlineModels.find((entry) => normalizeProviderId$1(entry.provider) === normalizedProvider && matchesModelId(entry));
}
function resolveConfiguredProviderConfig(cfg, provider) {
	const configuredProviders = cfg?.models?.providers;
	if (!configuredProviders) return;
	const exactProviderConfig = configuredProviders[provider];
	if (exactProviderConfig) return exactProviderConfig;
	return findNormalizedProviderValue(configuredProviders, provider);
}
function isModelsAddMetadataModel(params) {
	return params.model?.metadataSource === "models-add";
}
function findConfiguredProviderModel(providerConfig, provider, modelId) {
	return providerConfig?.models?.find((candidate) => matchesProviderScopedModelId({
		candidateId: candidate.id,
		provider,
		modelId
	}));
}
function hasConfiguredFallbackSurface(params) {
	if (params.modelId.startsWith("mock-")) return true;
	if (params.configuredModel) return true;
	const baseUrl = params.providerConfig?.baseUrl?.trim();
	return Boolean(baseUrl);
}
function readModelParams(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	return value;
}
function mergeModelParams(...entries) {
	const merged = Object.assign({}, ...entries.filter(Boolean));
	return Object.keys(merged).length > 0 ? merged : void 0;
}
function findConfiguredAgentModelParams(params) {
	const configuredModels = params.cfg?.agents?.defaults?.models;
	if (!configuredModels) return;
	const directKeys = [modelKey(params.provider, params.modelId), `${params.provider}/${params.modelId}`];
	for (const key of directKeys) {
		const direct = readModelParams(configuredModels[key]?.params);
		if (direct) return direct;
	}
	const normalizedProvider = normalizeProviderId$1(params.provider);
	const normalizedModelId = normalizeStaticProviderModelId(normalizedProvider, params.modelId).trim().toLowerCase();
	for (const [rawKey, entry] of Object.entries(configuredModels)) {
		const slashIndex = rawKey.indexOf("/");
		if (slashIndex <= 0) continue;
		const candidateProvider = rawKey.slice(0, slashIndex);
		const candidateModelId = rawKey.slice(slashIndex + 1);
		if (normalizeProviderId$1(candidateProvider) === normalizedProvider && normalizeStaticProviderModelId(normalizedProvider, candidateModelId).trim().toLowerCase() === normalizedModelId) return readModelParams(entry.params);
	}
}
function mergeConfiguredRuntimeModelParams(params) {
	return mergeModelParams(readModelParams(params.discoveredParams), readModelParams(params.providerParams), findConfiguredAgentModelParams({
		cfg: params.cfg,
		provider: params.provider,
		modelId: params.modelId
	}), readModelParams(params.configuredParams));
}
function applyConfiguredProviderOverrides(params) {
	const { discoveredModel, providerConfig, modelId } = params;
	const requestTimeoutMs = resolveProviderRequestTimeoutMs(providerConfig?.timeoutSeconds);
	const defaultModelParams = findConfiguredAgentModelParams({
		cfg: params.cfg,
		provider: params.provider,
		modelId
	});
	if (!providerConfig) {
		const resolvedParams = mergeModelParams(readModelParams(discoveredModel.params), defaultModelParams);
		const discoveredHeaders = sanitizeModelHeaders(discoveredModel.headers, { stripSecretRefMarkers: true });
		const requestConfig = resolveProviderRequestConfig({
			provider: params.provider,
			api: discoveredModel.api,
			baseUrl: discoveredModel.baseUrl,
			discoveredHeaders,
			capability: "llm",
			transport: "stream"
		});
		return {
			...discoveredModel,
			...resolvedParams ? { params: resolvedParams } : {},
			headers: requestConfig.headers
		};
	}
	const configuredModel = findConfiguredProviderModel(providerConfig, params.provider, modelId) ?? (discoveredModel.id !== modelId ? findConfiguredProviderModel(providerConfig, params.provider, discoveredModel.id) : void 0);
	const metadataOverrideModel = params.preferDiscoveredModelMetadata && isModelsAddMetadataModel({ model: configuredModel }) ? void 0 : configuredModel;
	const discoveredHeaders = sanitizeModelHeaders(discoveredModel.headers, { stripSecretRefMarkers: true });
	const providerHeaders = sanitizeModelHeaders(providerConfig.headers, { stripSecretRefMarkers: true });
	const providerRequest = sanitizeConfiguredModelProviderRequest(providerConfig.request);
	const configuredHeaders = sanitizeModelHeaders(configuredModel?.headers, { stripSecretRefMarkers: true });
	const providerParams = readModelParams(providerConfig.params);
	const passthroughRequestConfig = resolveProviderRequestConfig({
		provider: params.provider,
		api: discoveredModel.api,
		baseUrl: discoveredModel.baseUrl,
		discoveredHeaders,
		providerHeaders,
		modelHeaders: configuredHeaders,
		authHeader: providerConfig.authHeader,
		request: providerRequest,
		capability: "llm",
		transport: "stream"
	});
	if (!configuredModel && !providerConfig.baseUrl && !providerConfig.api && providerConfig.contextWindow === void 0 && providerConfig.contextTokens === void 0 && providerConfig.maxTokens === void 0 && requestTimeoutMs === void 0 && !providerHeaders && !providerRequest && !providerParams && !providerConfig.localService) {
		const resolvedParams = mergeModelParams(readModelParams(discoveredModel.params), defaultModelParams);
		return {
			...discoveredModel,
			...resolvedParams ? { params: resolvedParams } : {},
			...requestTimeoutMs !== void 0 ? { requestTimeoutMs } : {},
			headers: passthroughRequestConfig.headers,
			...providerConfig.authHeader !== void 0 ? { authHeader: providerConfig.authHeader } : {}
		};
	}
	const resolvedParams = mergeModelParams(readModelParams(discoveredModel.params), providerParams, defaultModelParams, readModelParams(configuredModel?.params));
	const normalizedInput = resolveProviderModelInput({
		provider: params.provider,
		modelId,
		modelName: metadataOverrideModel?.name ?? discoveredModel.name,
		input: metadataOverrideModel?.input,
		fallbackInput: discoveredModel.input
	});
	const providerDefaultApi = resolveConfiguredProviderDefaultApi({
		provider: params.provider,
		providerConfig,
		cfg: params.cfg,
		workspaceDir: params.workspaceDir,
		runtimeHooks: params.runtimeHooks
	});
	const resolvedTransportApi = metadataOverrideModel?.api ?? (params.preferDiscoveredTransport ? discoveredModel.api ?? providerConfig.api ?? providerDefaultApi : providerConfig.api ?? discoveredModel.api ?? providerDefaultApi);
	const resolvedTransportBaseUrl = metadataOverrideModel?.baseUrl ?? (params.preferDiscoveredTransport ? discoveredModel.baseUrl ?? providerConfig.baseUrl : providerConfig.baseUrl ?? discoveredModel.baseUrl);
	const resolvedTransport = resolveProviderTransport({
		provider: params.provider,
		modelId: discoveredModel.id,
		api: resolvedTransportApi,
		baseUrl: resolvedTransportBaseUrl,
		cfg: params.cfg,
		workspaceDir: params.workspaceDir,
		runtimeHooks: params.runtimeHooks
	});
	const resolvedContextWindow = metadataOverrideModel?.contextWindow ?? providerConfig.contextWindow;
	const resolvedMaxTokens = metadataOverrideModel?.maxTokens ?? providerConfig.maxTokens ?? discoveredModel.maxTokens;
	const resolvedCompat = mergeModelCompat(discoveredModel.compat, metadataOverrideModel?.compat);
	const resolvedReasoning = resolveMergedConfiguredModelReasoning({
		provider: params.provider,
		configuredCompat: metadataOverrideModel?.compat,
		resolvedCompat,
		configuredReasoning: metadataOverrideModel?.reasoning,
		discoveredReasoning: discoveredModel.reasoning
	});
	const requestConfig = resolveProviderRequestConfig({
		provider: params.provider,
		api: resolvedTransport.api ?? normalizeResolvedTransportApi(discoveredModel.api) ?? providerDefaultApi ?? "openai-responses",
		baseUrl: resolvedTransport.baseUrl ?? discoveredModel.baseUrl,
		discoveredHeaders,
		providerHeaders,
		modelHeaders: configuredHeaders,
		authHeader: providerConfig.authHeader,
		request: providerRequest,
		capability: "llm",
		transport: "stream"
	});
	return attachModelProviderLocalService(attachModelProviderRequestTransport({
		...discoveredModel,
		api: requestConfig.api ?? "openai-responses",
		baseUrl: requestConfig.baseUrl ?? discoveredModel.baseUrl,
		reasoning: resolvedReasoning,
		input: normalizedInput,
		cost: metadataOverrideModel?.cost ?? discoveredModel.cost,
		contextWindow: resolvedContextWindow ?? discoveredModel.contextWindow,
		contextTokens: metadataOverrideModel?.contextTokens ?? providerConfig.contextTokens ?? discoveredModel.contextTokens,
		maxTokens: typeof resolvedContextWindow === "number" ? Math.min(resolvedMaxTokens, resolvedContextWindow) : resolvedMaxTokens,
		...resolvedParams ? { params: resolvedParams } : {},
		...requestTimeoutMs !== void 0 ? { requestTimeoutMs } : {},
		headers: requestConfig.headers,
		...providerConfig.authHeader !== void 0 ? { authHeader: providerConfig.authHeader } : {},
		compat: resolvedCompat,
		mediaInput: mergeModelMediaInput(discoveredModel.mediaInput, metadataOverrideModel?.mediaInput)
	}, providerRequest), providerConfig.localService);
}
function resolveExplicitModelWithRegistry(params) {
	const { provider, modelId, modelRegistry, cfg, agentDir, workspaceDir, runtimeHooks } = params;
	const providerConfig = resolveConfiguredProviderConfig(cfg, provider);
	const requestTimeoutMs = resolveProviderRequestTimeoutMs(providerConfig?.timeoutSeconds);
	const inlineMatch = findInlineModelMatch({
		providers: cfg?.models?.providers ?? {},
		provider,
		modelId
	});
	if (inlineMatch?.api) {
		if (shouldUnconditionallySuppress({
			provider,
			id: modelId,
			...cfg ? { config: cfg } : {},
			...workspaceDir ? { workspaceDir } : {}
		})) return { kind: "suppressed" };
		const resolvedParams = mergeConfiguredRuntimeModelParams({
			cfg,
			provider,
			modelId,
			providerParams: providerConfig?.params,
			configuredParams: inlineMatch.params
		});
		return {
			kind: "resolved",
			model: normalizeResolvedModel({
				provider,
				cfg,
				agentDir,
				workspaceDir,
				model: {
					...inlineMatch,
					reasoning: resolveConfiguredModelReasoning({
						provider,
						compat: inlineMatch.compat,
						reasoning: inlineMatch.reasoning
					}),
					...resolvedParams ? { params: resolvedParams } : {},
					...requestTimeoutMs !== void 0 ? { requestTimeoutMs } : {}
				},
				runtimeHooks
			})
		};
	}
	if (shouldSuppressBuiltInModel({
		provider,
		id: modelId,
		...cfg ? { config: cfg } : {},
		...providerConfig?.baseUrl ? { baseUrl: providerConfig.baseUrl } : {},
		...workspaceDir ? { workspaceDir } : {}
	})) return { kind: "suppressed" };
	const model = modelRegistry.find(provider, modelId);
	if (model) return {
		kind: "resolved",
		model: normalizeResolvedModel({
			provider,
			cfg,
			agentDir,
			workspaceDir,
			model: applyConfiguredProviderOverrides({
				provider,
				discoveredModel: model,
				providerConfig,
				modelId,
				cfg,
				runtimeHooks,
				workspaceDir
			}),
			runtimeHooks
		})
	};
	const fallbackInlineMatch = findInlineModelMatch({
		providers: cfg?.models?.providers ?? {},
		provider,
		modelId
	});
	if (fallbackInlineMatch?.api) {
		const resolvedParams = mergeConfiguredRuntimeModelParams({
			cfg,
			provider,
			modelId,
			providerParams: providerConfig?.params,
			configuredParams: fallbackInlineMatch.params
		});
		return {
			kind: "resolved",
			model: normalizeResolvedModel({
				provider,
				cfg,
				agentDir,
				workspaceDir,
				model: {
					...fallbackInlineMatch,
					reasoning: resolveConfiguredModelReasoning({
						provider,
						compat: fallbackInlineMatch.compat,
						reasoning: fallbackInlineMatch.reasoning
					}),
					...resolvedParams ? { params: resolvedParams } : {},
					...requestTimeoutMs !== void 0 ? { requestTimeoutMs } : {}
				},
				runtimeHooks
			})
		};
	}
}
function resolveDynamicModelAuthProfile(params) {
	const explicitProfileId = params.authProfileId?.trim() || void 0;
	const store = ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false });
	if (explicitProfileId) {
		const credential = store.profiles[explicitProfileId];
		const configuredMode = params.cfg?.auth?.profiles?.[explicitProfileId]?.mode;
		return {
			authProfileId: explicitProfileId,
			...credential?.type || configuredMode ? { authProfileMode: credential?.type ?? configuredMode } : {}
		};
	}
	const profileId = [...new Set(listOpenAIAuthProfileProvidersForAgentRuntime({
		provider: params.provider,
		config: params.cfg
	}).flatMap((provider) => resolveAuthProfileOrder({
		cfg: params.cfg,
		store,
		provider,
		preferredProfile: params.preferredProfile
	})))][0];
	if (!profileId) return {};
	const credential = store.profiles[profileId];
	const configuredMode = params.cfg?.auth?.profiles?.[profileId]?.mode;
	return {
		authProfileId: profileId,
		...credential?.type || configuredMode ? { authProfileMode: credential?.type ?? configuredMode } : {}
	};
}
function resolvePluginDynamicModelWithRegistry(params) {
	const { provider, modelId, modelRegistry, cfg, agentDir, workspaceDir } = params;
	const runtimeHooks = params.runtimeHooks ?? DEFAULT_PROVIDER_RUNTIME_HOOKS;
	const providerConfig = resolveConfiguredProviderConfig(cfg, provider);
	const authProfile = resolveDynamicModelAuthProfile({
		provider,
		cfg,
		agentDir,
		authProfileId: params.authProfileId,
		preferredProfile: params.preferredProfile
	});
	const preferDiscoveredModelMetadata = shouldCompareProviderRuntimeResolvedModel({
		provider,
		modelId,
		cfg,
		agentDir,
		workspaceDir,
		runtimeHooks
	});
	const pluginDynamicModel = runtimeHooks.runProviderDynamicModel({
		provider,
		config: cfg,
		workspaceDir,
		context: {
			config: cfg,
			agentDir,
			workspaceDir,
			provider,
			modelId,
			modelRegistry,
			providerConfig,
			...authProfile
		}
	});
	if (!pluginDynamicModel) return;
	return normalizeResolvedModel({
		provider,
		cfg,
		agentDir,
		workspaceDir,
		model: applyConfiguredProviderOverrides({
			provider,
			discoveredModel: pluginDynamicModel,
			providerConfig,
			modelId,
			cfg,
			runtimeHooks,
			workspaceDir,
			preferDiscoveredModelMetadata
		}),
		runtimeHooks
	});
}
function resolveConfiguredFallbackModel(params) {
	const { provider, modelId, cfg, agentDir, workspaceDir, runtimeHooks } = params;
	const providerConfig = resolveConfiguredProviderConfig(cfg, provider);
	const requestTimeoutMs = resolveProviderRequestTimeoutMs(providerConfig?.timeoutSeconds);
	const configuredModel = findConfiguredProviderModel(providerConfig, provider, modelId);
	if (!hasConfiguredFallbackSurface({
		providerConfig,
		configuredModel,
		modelId
	})) return;
	const staticCatalogModel = configuredModel ? void 0 : resolveBundledStaticCatalogModel({
		provider,
		modelId,
		cfg,
		workspaceDir,
		includeRuntimeDiscovery: true
	});
	const metadataModel = configuredModel ?? staticCatalogModel;
	const fallbackCompat = configuredModel?.compat ?? staticCatalogModel?.compat;
	const fallbackMediaInput = configuredModel?.mediaInput ?? staticCatalogModel?.mediaInput;
	const providerHeaders = sanitizeModelHeaders(providerConfig?.headers, { stripSecretRefMarkers: true });
	const providerRequest = sanitizeConfiguredModelProviderRequest(providerConfig?.request);
	const modelHeaders = sanitizeModelHeaders(metadataModel?.headers, { stripSecretRefMarkers: true });
	const resolvedParams = mergeConfiguredRuntimeModelParams({
		cfg,
		provider,
		modelId,
		providerParams: providerConfig?.params,
		configuredParams: metadataModel?.params
	});
	const fallbackTransport = resolveProviderTransport({
		provider,
		modelId,
		api: normalizeResolvedTransportApi(configuredModel?.api) ?? resolveConfiguredProviderDefaultApi({
			provider,
			providerConfig,
			cfg,
			workspaceDir,
			runtimeHooks
		}) ?? normalizeResolvedTransportApi(staticCatalogModel?.api) ?? "openai-responses",
		baseUrl: configuredModel?.baseUrl ?? providerConfig?.baseUrl ?? staticCatalogModel?.baseUrl,
		cfg,
		workspaceDir,
		runtimeHooks
	});
	const requestConfig = resolveProviderRequestConfig({
		provider,
		api: fallbackTransport.api ?? "openai-responses",
		baseUrl: fallbackTransport.baseUrl,
		providerHeaders,
		modelHeaders,
		authHeader: providerConfig?.authHeader,
		request: providerRequest,
		capability: "llm",
		transport: "stream"
	});
	const fallbackReasoning = resolveConfiguredFallbackReasoning({
		provider,
		compat: fallbackCompat,
		reasoning: metadataModel?.reasoning
	});
	return normalizeResolvedModel({
		provider,
		cfg,
		agentDir,
		workspaceDir,
		model: attachModelProviderLocalService(attachModelProviderRequestTransport({
			id: modelId,
			name: metadataModel?.name ?? modelId,
			api: requestConfig.api ?? "openai-responses",
			provider,
			baseUrl: requestConfig.baseUrl,
			reasoning: fallbackReasoning,
			input: resolveProviderModelInput({
				provider,
				modelId,
				modelName: metadataModel?.name ?? modelId,
				input: metadataModel?.input
			}),
			cost: metadataModel?.cost ?? {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0
			},
			contextWindow: configuredModel?.contextWindow ?? providerConfig?.contextWindow ?? providerConfig?.models?.[0]?.contextWindow ?? staticCatalogModel?.contextWindow ?? 2e5,
			contextTokens: configuredModel?.contextTokens ?? providerConfig?.contextTokens ?? providerConfig?.models?.[0]?.contextTokens ?? staticCatalogModel?.contextTokens,
			maxTokens: configuredModel?.maxTokens ?? providerConfig?.maxTokens ?? providerConfig?.models?.[0]?.maxTokens ?? staticCatalogModel?.maxTokens ?? 2e5,
			...resolvedParams ? { params: resolvedParams } : {},
			...requestTimeoutMs !== void 0 ? { requestTimeoutMs } : {},
			headers: requestConfig.headers,
			...providerConfig?.authHeader !== void 0 ? { authHeader: providerConfig.authHeader } : {},
			compat: fallbackCompat,
			mediaInput: fallbackMediaInput
		}, providerRequest), providerConfig?.localService),
		runtimeHooks
	});
}
function shouldCompareProviderRuntimeResolvedModel(params) {
	return params.runtimeHooks.shouldPreferProviderRuntimeResolvedModel?.({
		provider: params.provider,
		config: params.cfg,
		workspaceDir: params.workspaceDir,
		context: {
			provider: params.provider,
			modelId: params.modelId,
			config: params.cfg,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir
		}
	}) ?? false;
}
function resolveConfiguredFallbackReasoning(params) {
	return resolveConfiguredModelReasoning(params) ?? false;
}
function resolveConfiguredModelReasoning(params) {
	if (params.reasoning !== void 0) return params.reasoning;
	return isVllmQwenThinkingCompat(params) ? true : void 0;
}
function resolveMergedConfiguredModelReasoning(params) {
	if (params.configuredReasoning !== void 0) return params.configuredReasoning;
	if (isVllmQwenThinkingCompat({
		provider: params.provider,
		compat: params.configuredCompat
	})) return true;
	return resolveConfiguredModelReasoning({
		provider: params.provider,
		compat: params.resolvedCompat,
		reasoning: params.discoveredReasoning
	}) ?? false;
}
function isVllmQwenThinkingCompat(params) {
	const thinkingFormat = readCompatThinkingFormat(params.compat);
	return normalizeProviderId$1(params.provider) === "vllm" && (thinkingFormat === "qwen" || thinkingFormat === "qwen-chat-template");
}
function readCompatThinkingFormat(compat) {
	if (!compat || typeof compat !== "object" || Array.isArray(compat)) return;
	const thinkingFormat = compat.thinkingFormat;
	return typeof thinkingFormat === "string" ? thinkingFormat : void 0;
}
function mergeModelCompat(base, override) {
	if (!base) return override;
	if (!override) return base;
	return {
		...base,
		...override
	};
}
function preferProviderRuntimeResolvedModel(params) {
	if (params.runtimeResolvedModel) return params.runtimeResolvedModel;
	return params.explicitModel;
}
function normalizeProviderModelRef(params) {
	const provider = canonicalizeManifestModelCatalogProviderAlias({
		provider: params.provider,
		cfg: params.cfg,
		workspaceDir: params.workspaceDir
	});
	return {
		provider,
		model: normalizeStaticProviderModelId(normalizeProviderId$1(provider), params.modelId)
	};
}
function resolveModelWithRegistry(params) {
	const workspaceDir = params.workspaceDir ?? params.cfg?.agents?.defaults?.workspace;
	const normalizedRef = normalizeProviderModelRef({
		...params,
		workspaceDir
	});
	const normalizedParams = {
		...params,
		provider: normalizedRef.provider,
		modelId: normalizedRef.model
	};
	const runtimeHooks = params.runtimeHooks ?? DEFAULT_PROVIDER_RUNTIME_HOOKS;
	const scopedParams = {
		...normalizedParams,
		...workspaceDir !== void 0 ? { workspaceDir } : {}
	};
	const explicitModel = resolveExplicitModelWithRegistry(scopedParams);
	if (explicitModel?.kind === "suppressed") return;
	if (explicitModel?.kind === "resolved") {
		if (!shouldCompareProviderRuntimeResolvedModel({
			provider: scopedParams.provider,
			modelId: scopedParams.modelId,
			cfg: scopedParams.cfg,
			agentDir: scopedParams.agentDir,
			workspaceDir,
			runtimeHooks
		})) return explicitModel.model;
		const pluginDynamicModel = resolvePluginDynamicModelWithRegistry(scopedParams);
		return preferProviderRuntimeResolvedModel({
			explicitModel: explicitModel.model,
			runtimeResolvedModel: pluginDynamicModel
		});
	}
	const pluginDynamicModel = resolvePluginDynamicModelWithRegistry(scopedParams);
	if (pluginDynamicModel) return pluginDynamicModel;
	return params.skipConfiguredFallback ? void 0 : resolveConfiguredFallbackModel(scopedParams);
}
function resolveModel(provider, modelId, agentDir, cfg, options) {
	const workspaceDir = resolveModelWorkspaceDir(cfg, options?.workspaceDir);
	const normalizedRef = normalizeProviderModelRef({
		provider,
		modelId,
		cfg,
		workspaceDir
	});
	const resolvedAgentDir = agentDir ?? resolveDefaultAgentDir(cfg ?? {});
	const cachedStores = !options?.authStorage && !options?.modelRegistry ? discoverCachedAgentStoresForAgent(resolvedAgentDir, cfg, workspaceDir) : void 0;
	const authStorage = options?.authStorage ?? cachedStores?.authStorage ?? discoverAuthStorage(resolvedAgentDir);
	const modelRegistry = options?.modelRegistry ?? cachedStores?.modelRegistry ?? discoverModels(authStorage, resolvedAgentDir);
	const runtimeHooks = resolveRuntimeHooks(options);
	const model = resolveModelWithRegistry({
		provider: normalizedRef.provider,
		modelId: normalizedRef.model,
		modelRegistry,
		cfg,
		agentDir: resolvedAgentDir,
		workspaceDir,
		authProfileId: options?.authProfileId,
		preferredProfile: options?.preferredProfile,
		runtimeHooks
	});
	if (model) return {
		model,
		authStorage,
		modelRegistry
	};
	return {
		error: buildUnknownModelError({
			provider: normalizedRef.provider,
			modelId: normalizedRef.model,
			cfg,
			agentDir: resolvedAgentDir,
			workspaceDir,
			runtimeHooks
		}),
		authStorage,
		modelRegistry
	};
}
async function resolveModelAsync(provider, modelId, agentDir, cfg, options) {
	const workspaceDir = resolveModelWorkspaceDir(cfg, options?.workspaceDir);
	const normalizedRef = normalizeProviderModelRef({
		provider,
		modelId,
		cfg,
		workspaceDir
	});
	const resolvedAgentDir = agentDir ?? resolveDefaultAgentDir(cfg ?? {});
	const emptyDiscoveryStores = options?.skipAgentDiscovery && (!options.authStorage || !options.modelRegistry) ? createEmptyAgentDiscoveryStores() : void 0;
	const cachedStores = !emptyDiscoveryStores && !options?.authStorage && !options?.modelRegistry ? discoverCachedAgentStoresForAgent(resolvedAgentDir, cfg, workspaceDir) : void 0;
	const authStorage = options?.authStorage ?? emptyDiscoveryStores?.authStorage ?? cachedStores?.authStorage ?? discoverAuthStorage(resolvedAgentDir);
	const modelRegistry = options?.modelRegistry ?? emptyDiscoveryStores?.modelRegistry ?? cachedStores?.modelRegistry ?? discoverModels(authStorage, resolvedAgentDir);
	const runtimeHooks = resolveRuntimeHooks(options);
	const explicitModel = resolveExplicitModelWithRegistry({
		provider: normalizedRef.provider,
		modelId: normalizedRef.model,
		modelRegistry,
		cfg,
		agentDir: resolvedAgentDir,
		workspaceDir,
		runtimeHooks
	});
	if (explicitModel?.kind === "suppressed") return {
		error: buildUnknownModelError({
			provider: normalizedRef.provider,
			modelId: normalizedRef.model,
			cfg,
			agentDir: resolvedAgentDir,
			workspaceDir,
			runtimeHooks
		}),
		authStorage,
		modelRegistry
	};
	const providerConfig = resolveConfiguredProviderConfig(cfg, normalizedRef.provider);
	const authProfile = resolveDynamicModelAuthProfile({
		provider: normalizedRef.provider,
		cfg,
		agentDir: resolvedAgentDir,
		authProfileId: options?.authProfileId,
		preferredProfile: options?.preferredProfile
	});
	let staticCatalogLookupComplete = false;
	let staticCatalogModel;
	const resolveStaticCatalogModel = () => {
		if (!options?.allowBundledStaticCatalogFallback) return;
		if (!staticCatalogLookupComplete) {
			staticCatalogLookupComplete = true;
			staticCatalogModel = resolveBundledStaticCatalogModel({
				provider: normalizedRef.provider,
				modelId: normalizedRef.model,
				cfg,
				workspaceDir
			});
		}
		return staticCatalogModel;
	};
	const resolveStaticCatalogFallbackModel = () => {
		const catalogModel = resolveStaticCatalogModel();
		if (!catalogModel) return;
		const overriddenStaticCatalogModel = applyConfiguredProviderOverrides({
			provider: normalizedRef.provider,
			discoveredModel: catalogModel,
			providerConfig,
			modelId: normalizedRef.model,
			cfg,
			runtimeHooks,
			workspaceDir,
			preferDiscoveredModelMetadata: true,
			preferDiscoveredTransport: options?.preferBundledStaticCatalogTransport
		});
		return normalizeResolvedModel({
			provider: normalizedRef.provider,
			cfg,
			agentDir: resolvedAgentDir,
			workspaceDir,
			model: overriddenStaticCatalogModel,
			runtimeHooks
		});
	};
	const resolveDynamicAttempt = async () => {
		await runtimeHooks.prepareProviderDynamicModel({
			provider: normalizedRef.provider,
			config: cfg,
			workspaceDir,
			context: {
				config: cfg,
				agentDir: resolvedAgentDir,
				workspaceDir,
				provider: normalizedRef.provider,
				modelId: normalizedRef.model,
				modelRegistry,
				providerConfig,
				...authProfile
			}
		});
		return resolveModelWithRegistry({
			provider: normalizedRef.provider,
			modelId: normalizedRef.model,
			modelRegistry,
			cfg,
			agentDir: resolvedAgentDir,
			workspaceDir,
			authProfileId: options?.authProfileId,
			preferredProfile: options?.preferredProfile,
			runtimeHooks,
			...options?.allowBundledStaticCatalogFallback ? { skipConfiguredFallback: true } : {}
		});
	};
	const providerRuntimeMetadataShouldWin = shouldCompareProviderRuntimeResolvedModel({
		provider: normalizedRef.provider,
		modelId: normalizedRef.model,
		cfg,
		agentDir: resolvedAgentDir,
		workspaceDir,
		runtimeHooks
	});
	let model = explicitModel?.kind === "resolved" && !providerRuntimeMetadataShouldWin ? explicitModel.model : void 0;
	model ??= await resolveDynamicAttempt();
	if (!model && !explicitModel && options?.retryTransientProviderRuntimeMiss) model = await resolveDynamicAttempt();
	if (!model && !explicitModel && options?.allowBundledStaticCatalogFallback) model = resolveStaticCatalogFallbackModel();
	if (!model && !explicitModel && options?.allowBundledStaticCatalogFallback) model = resolveConfiguredFallbackModel({
		provider: normalizedRef.provider,
		modelId: normalizedRef.model,
		cfg,
		agentDir: resolvedAgentDir,
		workspaceDir,
		runtimeHooks
	});
	if (model && options?.allowBundledStaticCatalogFallback) {
		const staticMediaInput = resolveStaticCatalogModel()?.mediaInput;
		const resolvedMediaInput = model.mediaInput;
		const mediaInput = mergeModelMediaInput(staticMediaInput, resolvedMediaInput);
		if (mediaInput) model = {
			...model,
			mediaInput
		};
	}
	if (model) return {
		model,
		authStorage,
		modelRegistry
	};
	return {
		error: buildUnknownModelError({
			provider: normalizedRef.provider,
			modelId: normalizedRef.model,
			cfg,
			agentDir: resolvedAgentDir,
			workspaceDir,
			runtimeHooks
		}),
		authStorage,
		modelRegistry
	};
}
/**
* Build a more helpful error when the model is not found.
*
* Some provider plugins only become available after setup/auth has registered
* them. When users point `agents.defaults.model.primary` at one of those
* providers before setup, the raw `Unknown model` error is too vague. Provider
* plugins can append a targeted recovery hint here.
*
* See: https://github.com/openclaw/openclaw/issues/17328
*/
function buildUnknownModelError(params) {
	const suppressed = buildSuppressedBuiltInModelError({
		provider: params.provider,
		id: params.modelId,
		...params.cfg ? { config: params.cfg } : {},
		...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}
	});
	if (suppressed) return suppressed;
	const base = `Unknown model: ${params.provider}/${params.modelId}`;
	const registrationHint = buildMissingProviderModelRegistrationHint({
		provider: params.provider,
		modelId: params.modelId,
		cfg: params.cfg
	});
	if (registrationHint) return `${base}. ${registrationHint}`;
	const hint = (params.runtimeHooks ?? DEFAULT_PROVIDER_RUNTIME_HOOKS).buildProviderUnknownModelHintWithPlugin({
		provider: params.provider,
		config: params.cfg,
		workspaceDir: params.workspaceDir,
		env: process.env,
		context: {
			config: params.cfg,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir,
			env: process.env,
			provider: params.provider,
			modelId: params.modelId
		}
	});
	return hint ? `${base}. ${hint}` : base;
}
function buildMissingProviderModelRegistrationHint(params) {
	const configuredModels = params.cfg?.agents?.defaults?.models;
	if (!configuredModels) return;
	const agentModelKey = modelKey(params.provider, params.modelId);
	if (!configuredModels[agentModelKey] && !configuredModels[`${params.provider}/${params.modelId}`]) return;
	const providerConfig = findNormalizedProviderValue(params.cfg?.models?.providers, params.provider);
	if ((Array.isArray(providerConfig?.models) ? providerConfig.models : []).some((entry) => {
		if (!entry || typeof entry !== "object" || !("id" in entry)) return false;
		const id = entry.id;
		return typeof id === "string" && id === params.modelId;
	})) return;
	return `Found agents.defaults.models["${agentModelKey}"], but no matching models.providers["${params.provider}"].models[] entry. Add { "id": "${params.modelId}", "name": "${params.modelId}" } to models.providers["${params.provider}"].models[] to register this provider model. For custom or proxy providers, also set api and baseUrl so requests route to the intended endpoint. See https://docs.openclaw.ai/concepts/model-providers.`;
}
//#endregion
export { resolveBundledStaticCatalogModel as a, bundledStaticCatalogProviderUsesRuntimeAugment as i, resolveModelAsync as n, buildInlineProviderModels as o, resolveModelWithRegistry as r, buildModelAliasLines as s, resolveModel as t };
