import { t as createLazyImportLoader } from "./lazy-promise-BONnzNfb.js";
import { s as resolveRuntimeServiceVersion } from "./version-Crcn9X9T.js";
import { w as hasSessionAutoModelFallbackProvenance } from "./agent-scope-MrLta7Pq.js";
import { c as parseAgentSessionKey } from "./session-key-utils-Bx3apsJ3.js";
import { i as getRuntimeConfig } from "./io-Gi7-pyU-.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-mDjiWzE5.js";
import "./config-C9RxTsn1.js";
import { i as resolveMainSessionKey } from "./main-session-Eahn-btj.js";
import { u as resolveStorePath } from "./paths-NEwU8m3X.js";
import { u as resolveSessionTotalTokens } from "./types-D8S_uNvu.js";
import { l as peekSystemEvents } from "./system-events-C5WI3S5a.js";
import { o as resolveCronJobsStorePath } from "./store-_jAmB352.js";
import { i as summarizeRetainedLostTaskAuditFindings, r as summarizeActionableTaskAuditFindings } from "./task-registry.audit-BEOrRfo1.js";
import { t as areRuntimeModelRefsEquivalent } from "./model-runtime-aliases-6XX4uD6a.js";
import { r as resolveHeartbeatSummaryForAgent } from "./heartbeat-summary-B73O--Iv.js";
import { a as createLazyRuntimeSurface } from "./lazy-runtime-D-7_JraP.js";
import { n as readSessionStoreReadOnly, t as listGatewayAgentsBasic } from "./agent-list-CY6dSCpA.js";
//#region src/commands/status.summary.ts
const RECENT_SESSION_LIMIT = 10;
const channelSummaryModuleLoader = createLazyImportLoader(() => import("./channel-summary-BURsao6y.js"));
const channelPluginIdsModuleLoader = createLazyImportLoader(() => import("./channel-plugin-ids-JT38R6k8.js"));
const linkChannelModuleLoader = createLazyImportLoader(() => import("./status.link-channel-DZf88hdH.js"));
const taskRegistryMaintenanceModuleLoader = createLazyImportLoader(() => import("./task-registry.maintenance-DciQfQc1.js"));
function loadChannelSummaryModule() {
	return channelSummaryModuleLoader.load();
}
function loadChannelPluginIdsModule() {
	return channelPluginIdsModuleLoader.load();
}
function loadLinkChannelModule() {
	return linkChannelModuleLoader.load();
}
const loadStatusSummaryRuntimeModule = createLazyRuntimeSurface(() => import("./commands/status.summary.runtime.js"), ({ statusSummaryRuntime }) => statusSummaryRuntime);
function loadTaskRegistryMaintenanceModule() {
	return taskRegistryMaintenanceModuleLoader.load();
}
const buildFlags = (entry) => {
	if (!entry) return [];
	const flags = [];
	const think = entry?.thinkingLevel;
	if (typeof think === "string" && think.length > 0) flags.push(`think:${think}`);
	const verbose = entry?.verboseLevel;
	if (typeof verbose === "string" && verbose.length > 0) flags.push(`verbose:${verbose}`);
	if (typeof entry?.fastMode === "boolean") flags.push(entry.fastMode ? "fast" : "fast:off");
	const reasoning = entry?.reasoningLevel;
	if (typeof reasoning === "string" && reasoning.length > 0) flags.push(`reasoning:${reasoning}`);
	const elevated = entry?.elevatedLevel;
	if (typeof elevated === "string" && elevated.length > 0) flags.push(`elevated:${elevated}`);
	if (entry?.systemSent) flags.push("system");
	if (entry?.abortedLastRun) flags.push("aborted");
	const sessionId = entry?.sessionId;
	if (typeof sessionId === "string" && sessionId.length > 0) flags.push(`id:${sessionId}`);
	return flags;
};
function discountRetainedLostTaskFailures(tasks, retainedLostCount) {
	if (retainedLostCount <= 0 || tasks.failures <= 0) return tasks;
	return {
		...tasks,
		failures: Math.max(0, tasks.failures - retainedLostCount)
	};
}
function hasUserPinnedModelSelection(entry) {
	if (!entry?.modelOverride) return false;
	if (entry.modelOverrideSource === "user") return true;
	if (entry.modelOverrideSource === "auto") return false;
	return !hasSessionAutoModelFallbackProvenance(entry);
}
function compareSessionCandidatesByUpdatedAt(left, right) {
	return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
}
function listSessionCandidates(store) {
	return Object.entries(store).filter(([key]) => key !== "global" && key !== "unknown").map(([key, entry]) => ({
		key,
		entry,
		updatedAt: entry?.updatedAt ?? null
	})).toSorted(compareSessionCandidatesByUpdatedAt);
}
/** Removes session paths and recent session details from a status summary. */
function redactSensitiveStatusSummary(summary) {
	return {
		...summary,
		sessions: {
			...summary.sessions,
			paths: [],
			defaults: {
				model: null,
				contextTokens: null
			},
			recent: [],
			byAgent: summary.sessions.byAgent.map((entry) => ({
				...entry,
				path: "[redacted]",
				recent: []
			}))
		}
	};
}
/** Builds the aggregate status summary for agents, sessions, tasks, heartbeat, and channels. */
async function getStatusSummary(options = {}) {
	const { includeSensitive = true, includeChannelSummary = true } = options;
	const { classifySessionKey, resolveConfiguredStatusModelRef, resolveContextTokensForModel, resolveSessionRuntimeLabel, resolveSessionModelRef } = await loadStatusSummaryRuntimeModule();
	const cfg = options.config ?? getRuntimeConfig();
	const channelScopeConfig = options.sourceConfig === void 0 ? { config: cfg } : {
		config: cfg,
		activationSourceConfig: options.sourceConfig
	};
	const needsChannelPlugins = includeChannelSummary && await loadChannelPluginIdsModule().then(({ hasConfiguredChannelsForReadOnlyScope }) => hasConfiguredChannelsForReadOnlyScope(channelScopeConfig));
	const linkContext = needsChannelPlugins ? await loadLinkChannelModule().then(({ resolveLinkChannelContext }) => resolveLinkChannelContext(cfg, { sourceConfig: options.sourceConfig })) : null;
	const agentList = listGatewayAgentsBasic(cfg);
	const heartbeatAgents = agentList.agents.map((agent) => {
		const summary = resolveHeartbeatSummaryForAgent(cfg, agent.id);
		return {
			agentId: agent.id,
			enabled: summary.enabled,
			every: summary.every,
			everyMs: summary.everyMs
		};
	});
	const channelSummary = needsChannelPlugins ? await loadChannelSummaryModule().then(({ buildChannelSummary }) => buildChannelSummary(cfg, {
		colorize: true,
		includeAllowFrom: true,
		sourceConfig: options.sourceConfig
	})) : [];
	const queuedSystemEvents = peekSystemEvents(resolveMainSessionKey(cfg));
	const taskMaintenanceModule = await loadTaskRegistryMaintenanceModule();
	taskMaintenanceModule.configureTaskRegistryMaintenance({ cronStorePath: resolveCronJobsStorePath(cfg.cron?.store) });
	const rawTasks = taskMaintenanceModule.getInspectableTaskRegistrySummary();
	const taskAuditFindings = taskMaintenanceModule.getInspectableTaskAuditFindings();
	const now = Date.now();
	const taskAudit = summarizeActionableTaskAuditFindings(taskAuditFindings, { now });
	const taskAuditRetainedLost = summarizeRetainedLostTaskAuditFindings(taskAuditFindings, { now });
	const tasks = discountRetainedLostTaskFailures(rawTasks, taskAuditRetainedLost.count);
	const resolved = resolveConfiguredStatusModelRef({
		cfg,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL
	});
	const configModel = resolved.model ?? "gpt-5.5";
	const configContextTokens = resolveContextTokensForModel({
		cfg,
		provider: resolved.provider ?? "openai",
		model: configModel,
		contextTokensOverride: cfg.agents?.defaults?.contextTokens,
		fallbackContextTokens: 2e5,
		allowAsyncLoad: false
	}) ?? 2e5;
	const storeCache = /* @__PURE__ */ new Map();
	const candidateCache = /* @__PURE__ */ new Map();
	const loadStore = (storePath) => {
		const cached = storeCache.get(storePath);
		if (cached) return cached;
		const store = readSessionStoreReadOnly(storePath);
		storeCache.set(storePath, store);
		return store;
	};
	const loadSessionCandidates = (storePath) => {
		const cached = candidateCache.get(storePath);
		if (cached) return cached;
		const candidates = listSessionCandidates(loadStore(storePath));
		candidateCache.set(storePath, candidates);
		return candidates;
	};
	const buildSessionRows = (candidates, opts = {}) => candidates.map(({ key, entry, updatedAt }) => {
		const age = updatedAt ? now - updatedAt : null;
		const parsedAgentId = parseAgentSessionKey(key)?.agentId;
		const agentId = opts.agentIdOverride ?? parsedAgentId;
		const configuredForSession = resolveConfiguredStatusModelRef({
			cfg,
			defaultProvider: DEFAULT_PROVIDER,
			defaultModel: DEFAULT_MODEL,
			agentId
		});
		const configuredSessionModel = configuredForSession.model ?? "gpt-5.5";
		const configuredSessionModelLabel = `${configuredForSession.provider ?? "openai"}/${configuredSessionModel}`;
		const resolvedModel = resolveSessionModelRef(cfg, entry, opts.agentIdOverride);
		const model = resolvedModel.model ?? configuredSessionModel ?? null;
		const selectedModelLabel = resolvedModel.provider && model ? `${resolvedModel.provider}/${model}` : model;
		const modelSelectionDiffers = selectedModelLabel != null && selectedModelLabel !== configuredSessionModelLabel && !areRuntimeModelRefsEquivalent(selectedModelLabel, configuredSessionModelLabel) && hasUserPinnedModelSelection(entry);
		const contextTokens = resolveContextTokensForModel({
			cfg,
			provider: resolvedModel.provider,
			model,
			contextTokensOverride: entry?.contextTokens,
			fallbackContextTokens: configContextTokens ?? void 0,
			allowAsyncLoad: false
		}) ?? null;
		const total = resolveSessionTotalTokens(entry);
		const totalTokensFresh = typeof entry?.totalTokens === "number" ? entry?.totalTokensFresh !== false : false;
		const remaining = contextTokens != null && total !== void 0 ? Math.max(0, contextTokens - total) : null;
		const pct = contextTokens && contextTokens > 0 && total !== void 0 ? Math.min(999, Math.round(total / contextTokens * 100)) : null;
		const runtime = resolveSessionRuntimeLabel({
			cfg,
			entry,
			provider: resolvedModel.provider,
			model: model ?? "",
			agentId,
			sessionKey: key
		});
		return {
			agentId,
			key,
			kind: classifySessionKey(key, entry),
			sessionId: entry?.sessionId,
			updatedAt,
			age,
			thinkingLevel: entry?.thinkingLevel,
			fastMode: entry?.fastMode,
			verboseLevel: entry?.verboseLevel,
			traceLevel: entry?.traceLevel,
			reasoningLevel: entry?.reasoningLevel,
			elevatedLevel: entry?.elevatedLevel,
			systemSent: entry?.systemSent,
			abortedLastRun: entry?.abortedLastRun,
			inputTokens: entry?.inputTokens,
			outputTokens: entry?.outputTokens,
			cacheRead: entry?.cacheRead,
			cacheWrite: entry?.cacheWrite,
			totalTokens: total ?? null,
			totalTokensFresh,
			remainingTokens: remaining,
			percentUsed: pct,
			model,
			configuredModel: configuredSessionModelLabel,
			selectedModel: selectedModelLabel,
			modelSelectionReason: modelSelectionDiffers ? "session override" : null,
			runtime,
			contextTokens,
			flags: buildFlags(entry)
		};
	});
	const paths = /* @__PURE__ */ new Set();
	const byAgent = agentList.agents.map((agent) => {
		const storePath = resolveStorePath(cfg.session?.store, { agentId: agent.id });
		paths.add(storePath);
		const candidates = loadSessionCandidates(storePath);
		const sessions = buildSessionRows(candidates.slice(0, RECENT_SESSION_LIMIT), { agentIdOverride: agent.id });
		return {
			agentId: agent.id,
			path: storePath,
			count: candidates.length,
			recent: sessions
		};
	});
	const allSessions = Array.from(paths).flatMap((storePath) => loadSessionCandidates(storePath)).toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
	const recent = buildSessionRows(allSessions.slice(0, RECENT_SESSION_LIMIT));
	const totalSessions = allSessions.length;
	const summary = {
		runtimeVersion: resolveRuntimeServiceVersion(process.env),
		linkChannel: linkContext ? {
			id: linkContext.plugin.id,
			label: linkContext.plugin.meta.label ?? "Channel",
			linked: linkContext.linked,
			authAgeMs: linkContext.authAgeMs
		} : void 0,
		heartbeat: {
			defaultAgentId: agentList.defaultId,
			agents: heartbeatAgents
		},
		channelSummary,
		queuedSystemEvents,
		tasks,
		taskAudit,
		...taskAuditRetainedLost.count > 0 ? { taskAuditRetainedLost } : {},
		sessions: {
			paths: Array.from(paths),
			count: totalSessions,
			defaults: {
				model: configModel ?? null,
				contextTokens: configContextTokens ?? null
			},
			recent,
			byAgent
		}
	};
	return includeSensitive ? summary : redactSensitiveStatusSummary(summary);
}
//#endregion
export { redactSensitiveStatusSummary as n, getStatusSummary as t };
