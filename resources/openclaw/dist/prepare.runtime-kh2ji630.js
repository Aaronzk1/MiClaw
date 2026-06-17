import { c as normalizeOptionalString } from "./string-coerce-mnp54Vah.js";
import { o as isRecord } from "./record-coerce-DHZ4bFlT.js";
import { _ as uniqueStrings } from "./string-normalization-WNUDCpXX.js";
import { p as resolveUserPath } from "./utils-CCC-BEJH.js";
import { m as writeJson, o as tryReadJson } from "./json-files-2umMHm0W.js";
import { y as resolveSessionAgentIds } from "./agent-scope-MrLta7Pq.js";
import { a as resolveAgentDir } from "./agent-scope-config-CgCYpZfK.js";
import { i as getRuntimeConfig } from "./io-Gi7-pyU-.js";
import { t as applyMergePatch } from "./merge-patch-DFjTrPP1.js";
import { t as DEFAULT_CONTEXT_TOKENS } from "./defaults-mDjiWzE5.js";
import "./config-C9RxTsn1.js";
import { F as readClaudeCliCredentialsCached, I as readCodexCliCredentialsCached, L as readGeminiCliCredentialsCached, c as loadAuthProfileStoreForRuntime } from "./store-C8spD0DG.js";
import { n as applyPluginTextReplacements } from "./text-transforms.runtime.js";
import { t as extractMcpServerMap } from "./bundle-mcp-BeA96PNA.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-BnyQREr6.js";
import { o as resolveContextEngine } from "./registry-Dca-zXEr.js";
import { r as loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader-Dp8IS24b.js";
import { r as externalCliDiscoveryForProviderAuth } from "./external-cli-discovery-Cr-vJMRB.js";
import { n as annotateInterSessionPromptText } from "./input-provenance-CYQvfQZP.js";
import { s as resolveContextTokensForModel } from "./context-CvrdNrKN.js";
import { i as resolveCliBackendConfig } from "./cli-backends-CcaQo9wE.js";
import { i as buildGenericCliContextEngineHostSupport, r as assertContextEngineHostSupport } from "./host-compat-BibWlia2.js";
import { n as ensureSystemPromptCacheBoundary } from "./system-prompt-cache-boundary-vl0D_wqS.js";
import { t as buildAgentHookContextChannelFields } from "./hook-agent-context-52t6V0oE.js";
import { u as resolveSkillsPromptForRun } from "./workspace-_gXfieOh.js";
import { S as toCliBundleMcpServerConfig, x as loadMergedBundleMcpConfig } from "./agent-bundle-mcp-runtime-Bf36JLIh.js";
import { b as resolveBootstrapTotalMaxChars, v as resolveBootstrapMaxChars, y as resolveBootstrapPromptTruncationWarningMode } from "./embedded-agent-helpers-7sfpu1OT.js";
import { a as hashCliSessionText, o as resolveCliSessionReuse } from "./cli-session-DY8dQzGa.js";
import { t as ensureContextEnginesInitialized } from "./init-CJMy1vMZ.js";
import { i as buildBootstrapPromptWarning, o as buildBootstrapTruncationReportMeta, r as buildBootstrapInjectionStats, t as analyzeBootstrapBudget } from "./bootstrap-budget-bmmzkOyn.js";
import { a as resolveBootstrapContextForRun, i as makeBootstrapWarn } from "./bootstrap-files-DiRvjZAg.js";
import { t as resolveHeartbeatPromptForSystemPrompt } from "./heartbeat-system-prompt-CKczFcLs.js";
import { n as appendModelIdentitySystemPrompt, r as buildModelIdentityPromptLine } from "./system-prompt-config-CVau6v04.js";
import { t as buildSystemPromptReport } from "./system-prompt-report-DXh85F1c.js";
import { a as prependSystemPromptAddition, c as resolvePromptBuildHookResult, s as resolveAttemptMediaTaskSystemPromptAddition } from "./attempt.prompt-helpers-CgpMNs9B.js";
import { s as resolveContextWindowInfo } from "./context-window-guard-Xr_q41jl.js";
import { n as composeSystemPromptWithHookContext } from "./attempt.thread-helpers-UNL5VFeq.js";
import { t as buildCurrentInboundPrompt } from "./runtime-context-prompt-BJmPR0_F.js";
import { n as resolveRunWorkspaceDir, t as redactRunIdentifier } from "./workspace-run-CBuaghKz.js";
import { r as cliBackendLog } from "./log-RtgQ_MP8.js";
import { c as buildCliSessionHistoryPrompt, d as loadCliSessionHistoryMessages, f as loadCliSessionReseedMessages, l as hasCliSessionTranscript, n as claudeCliSessionTranscriptHasContent, p as resolveAutoCliSessionReseedHistoryChars, r as claudeCliSessionTranscriptHasOrphanedToolUse } from "./attempt-execution.helpers-CPoC_qYr.js";
import { a as decodeHeaderEnvPlaceholder, i as applyCommonServerConfig, o as normalizeStringRecord } from "./codex-mcp-config-DGNrQzzV.js";
import { n as injectCodexMcpConfigArgs } from "./bundle-mcp-codex-QokEsifk.js";
import { a as normalizeCliModel, n as buildCliAgentSystemPrompt } from "./helpers-BLGx1Zfi.js";
import { t as prepareClaudeCliSkillsPlugin } from "./claude-skills-plugin-DpYXpxCq.js";
import { a as createMcpLoopbackServerConfig, i as resolveMcpLoopbackScopedTools, n as ensureMcpLoopbackServer, o as getActiveMcpLoopbackRuntime, s as resolveMcpLoopbackBearerToken } from "./mcp-http-Js9d10tX.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";
//#region src/plugin-sdk/anthropic-cli.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "anthropic",
		artifactBasename: "api.js"
	});
}
loadFacadeModule()["CLAUDE_CLI_BACKEND_ID"];
/** Returns whether a provider id belongs to the Claude CLI backend family. */
const isClaudeCliProvider = ((...args) => loadFacadeModule()["isClaudeCliProvider"](...args));
const cliAuthEpochDeps = {
	readClaudeCliCredentialsCached,
	readCodexCliCredentialsCached,
	readGeminiCliCredentialsCached,
	loadAuthProfileStoreForRuntime
};
function hashCliAuthEpochPart(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}
function encodeUnknown(value) {
	return JSON.stringify(value ?? null);
}
function encodeOAuthIdentity(credential) {
	return JSON.stringify([
		"oauth",
		credential.provider,
		credential.clientId ?? null,
		credential.email ?? null,
		credential.enterpriseUrl ?? null,
		credential.projectId ?? null,
		credential.accountId ?? null
	]);
}
function encodeClaudeCredential(credential) {
	return encodeOAuthIdentity({
		type: "oauth",
		provider: credential.provider
	});
}
function encodeCodexCredential(credential) {
	return encodeOAuthIdentity(credential);
}
function encodeGeminiCredential(credential) {
	return encodeOAuthIdentity(credential);
}
function encodeAuthProfileCredential(credential) {
	switch (credential.type) {
		case "api_key": return JSON.stringify([
			"api_key",
			credential.provider,
			credential.key ?? null,
			encodeUnknown(credential.keyRef),
			credential.email ?? null,
			credential.displayName ?? null,
			encodeUnknown(credential.metadata)
		]);
		case "token":
			if (credential.tokenRef !== void 0) return JSON.stringify([
				"token-identity",
				credential.provider,
				encodeUnknown(credential.tokenRef),
				credential.email ?? null,
				credential.displayName ?? null
			]);
			return JSON.stringify([
				"token",
				credential.provider,
				credential.token ?? null,
				encodeUnknown(credential.tokenRef),
				credential.email ?? null,
				credential.displayName ?? null
			]);
		case "oauth": return encodeOAuthIdentity(credential);
	}
	throw new Error("Unsupported auth profile credential type");
}
function hasOAuthAccountIdentity(credential) {
	return credential.type === "oauth" && (normalizeOptionalString(credential.accountId) !== void 0 || normalizeOptionalString(credential.email) !== void 0);
}
function encodeAuthProfileEpochPart(authProfileId, credential) {
	const credentialHash = hashCliAuthEpochPart(encodeAuthProfileCredential(credential));
	if (hasOAuthAccountIdentity(credential)) return `profile:oauth-identity:${credentialHash}`;
	return `profile:${authProfileId}:${credentialHash}`;
}
function getLocalCliCredentialFingerprint(provider) {
	switch (provider) {
		case "claude-cli": {
			const credential = cliAuthEpochDeps.readClaudeCliCredentialsCached({
				ttlMs: 5e3,
				allowKeychainPrompt: false
			});
			return credential ? hashCliAuthEpochPart(encodeClaudeCredential(credential)) : void 0;
		}
		case "codex-cli": {
			const credential = cliAuthEpochDeps.readCodexCliCredentialsCached({
				ttlMs: 5e3,
				allowKeychainPrompt: false
			});
			return credential ? hashCliAuthEpochPart(encodeCodexCredential(credential)) : void 0;
		}
		case "google-gemini-cli": {
			const credential = cliAuthEpochDeps.readGeminiCliCredentialsCached({ ttlMs: 5e3 });
			return credential ? hashCliAuthEpochPart(encodeGeminiCredential(credential)) : void 0;
		}
		default: return;
	}
}
function getAuthProfileCredential(store, authProfileId) {
	if (!authProfileId) return;
	return store.profiles[authProfileId];
}
/** Resolves the stable auth epoch hash for a CLI runtime/provider session. */
async function resolveCliAuthEpoch(params) {
	const provider = params.provider.trim();
	const authProfileId = normalizeOptionalString(params.authProfileId);
	const parts = [];
	if (params.skipLocalCredential !== true) {
		const localFingerprint = getLocalCliCredentialFingerprint(provider);
		if (localFingerprint) parts.push(`local:${provider}:${localFingerprint}`);
	}
	if (authProfileId) {
		const credential = getAuthProfileCredential(cliAuthEpochDeps.loadAuthProfileStoreForRuntime(void 0, {
			readOnly: true,
			allowKeychainPrompt: false
		}), authProfileId);
		if (credential) parts.push(encodeAuthProfileEpochPart(authProfileId, credential));
	}
	if (parts.length === 0) return;
	return hashCliAuthEpochPart(parts.join("\n"));
}
//#endregion
//#region src/agents/cli-runner/bundle-mcp-claude.ts
/**
* Claude CLI argument helpers for OpenClaw-managed bundle MCP config.
*/
/** Find an existing Claude `--mcp-config` argument value. */
function findClaudeMcpConfigPath(args) {
	if (!args?.length) return;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i] ?? "";
		if (arg === "--mcp-config") return normalizeOptionalString(args[i + 1]);
		if (arg.startsWith("--mcp-config=")) return normalizeOptionalString(arg.slice(13));
	}
}
/** Return Claude args with OpenClaw's strict MCP config path injected. */
function injectClaudeMcpConfigArgs(args, mcpConfigPath) {
	const next = [];
	for (let i = 0; i < (args?.length ?? 0); i += 1) {
		const arg = args?.[i] ?? "";
		if (arg === "--strict-mcp-config") continue;
		if (arg === "--mcp-config") {
			i += 1;
			continue;
		}
		if (arg.startsWith("--mcp-config=")) continue;
		next.push(arg);
	}
	next.push("--strict-mcp-config", "--mcp-config", mcpConfigPath);
	return next;
}
//#endregion
//#region src/agents/cli-runner/bundle-mcp-gemini.ts
/**
* Gemini CLI bundle MCP adapter that writes temporary system settings files.
*/
async function readJsonObject(filePath) {
	const raw = await tryReadJson(filePath);
	return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
}
function resolveEnvPlaceholder(value, inheritedEnv) {
	const decoded = decodeHeaderEnvPlaceholder(value);
	if (!decoded) return value;
	const resolved = inheritedEnv?.[decoded.envVar] ?? process.env[decoded.envVar] ?? "";
	return decoded.bearer ? `Bearer ${resolved}` : resolved;
}
function normalizeGeminiServerConfig(server, inheritedEnv) {
	const next = {};
	applyCommonServerConfig(next, server);
	if (typeof server.type === "string") next.type = server.type;
	const headers = normalizeStringRecord(server.headers);
	if (headers) next.headers = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, resolveEnvPlaceholder(value, inheritedEnv)]));
	if (typeof server.trust === "boolean") next.trust = server.trust;
	return next;
}
/** Writes merged Gemini system settings and returns env plus cleanup hook. */
async function writeGeminiSystemSettings(mergedConfig, inheritedEnv) {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gemini-mcp-"));
	const settingsPath = path.join(tempDir, "settings.json");
	const existingSettingsPath = inheritedEnv?.GEMINI_CLI_SYSTEM_SETTINGS_PATH ?? process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
	const base = typeof existingSettingsPath === "string" && existingSettingsPath.trim() ? await readJsonObject(existingSettingsPath) : {};
	const normalizedConfig = { mcpServers: Object.fromEntries(Object.entries(mergedConfig.mcpServers).map(([name, server]) => [name, normalizeGeminiServerConfig(server, inheritedEnv)])) };
	const settings = applyMergePatch(base, {
		mcp: { allowed: Object.keys(normalizedConfig.mcpServers) },
		mcpServers: normalizedConfig.mcpServers
	});
	if (!isRecord(settings.mcp) || !isRecord(settings.mcpServers)) throw new Error("Gemini MCP settings merge produced an invalid object");
	await writeJson(settingsPath, settings, { trailingNewline: true });
	return {
		env: {
			...inheritedEnv,
			GEMINI_CLI_SYSTEM_SETTINGS_PATH: settingsPath
		},
		cleanup: async () => {
			await fs.rm(tempDir, {
				recursive: true,
				force: true
			});
		}
	};
}
//#endregion
//#region src/agents/cli-runner/bundle-mcp.ts
/**
* Prepares bundled MCP configuration for CLI runner backends.
*/
function resolveBundleMcpMode(mode) {
	return mode ?? "claude-config-file";
}
async function readExternalMcpConfig(configPath) {
	return { mcpServers: extractMcpServerMap(await tryReadJson(configPath)) };
}
function sortJsonValue(value) {
	if (Array.isArray(value)) return value.map((entry) => sortJsonValue(entry));
	if (!isRecord(value)) return value;
	return Object.fromEntries(Object.keys(value).toSorted().map((key) => [key, sortJsonValue(value[key])]));
}
function normalizeOpenClawLoopbackUrl(value) {
	const match = /^(http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])):\d+(\/mcp)$/.exec(value.trim()) ?? void 0;
	if (!match) return value;
	return `${match[1]}:<openclaw-loopback>${match[2]}`;
}
function canonicalizeBundleMcpConfigForResume(config) {
	return { mcpServers: sortJsonValue(Object.fromEntries(Object.entries(config.mcpServers).map(([name, server]) => {
		if (name !== "openclaw" || typeof server.url !== "string") return [name, sortJsonValue(server)];
		return [name, sortJsonValue({
			...server,
			url: normalizeOpenClawLoopbackUrl(server.url)
		})];
	}))) };
}
async function prepareModeSpecificBundleMcpConfig(params) {
	const serializedConfig = `${JSON.stringify(params.mergedConfig, null, 2)}\n`;
	const mcpConfigHash = crypto.createHash("sha256").update(serializedConfig).digest("hex");
	const serializedResumeConfig = `${JSON.stringify(canonicalizeBundleMcpConfigForResume(params.mergedConfig), null, 2)}\n`;
	const mcpResumeHash = crypto.createHash("sha256").update(serializedResumeConfig).digest("hex");
	if (params.mode === "codex-config-overrides") return {
		backend: {
			...params.backend,
			args: injectCodexMcpConfigArgs(params.backend.args, params.mergedConfig),
			resumeArgs: injectCodexMcpConfigArgs(params.backend.resumeArgs ?? params.backend.args ?? [], params.mergedConfig)
		},
		mcpConfigHash,
		mcpResumeHash,
		env: params.env
	};
	if (params.mode === "gemini-system-settings") {
		const settings = await writeGeminiSystemSettings(params.mergedConfig, params.env);
		return {
			backend: params.backend,
			mcpConfigHash,
			mcpResumeHash,
			env: settings.env,
			cleanup: settings.cleanup
		};
	}
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cli-mcp-"));
	const mcpConfigPath = path.join(tempDir, "mcp.json");
	await fs.writeFile(mcpConfigPath, serializedConfig, "utf-8");
	return {
		backend: {
			...params.backend,
			args: injectClaudeMcpConfigArgs(params.backend.args, mcpConfigPath),
			resumeArgs: injectClaudeMcpConfigArgs(params.backend.resumeArgs ?? params.backend.args ?? [], mcpConfigPath)
		},
		mcpConfigHash,
		mcpResumeHash,
		env: params.env,
		cleanup: async () => {
			await fs.rm(tempDir, {
				recursive: true,
				force: true
			});
		}
	};
}
/** Prepare backend args/env/cleanup for bundle MCP injection into a CLI run. */
async function prepareCliBundleMcpConfig(params) {
	if (!params.enabled) return {
		backend: params.backend,
		env: params.env
	};
	const mode = resolveBundleMcpMode(params.mode);
	const existingMcpConfigPath = mode === "claude-config-file" ? findClaudeMcpConfigPath(params.backend.resumeArgs) ?? findClaudeMcpConfigPath(params.backend.args) : void 0;
	let mergedConfig = { mcpServers: {} };
	if (existingMcpConfigPath) {
		const resolvedExistingPath = path.isAbsolute(existingMcpConfigPath) ? existingMcpConfigPath : path.resolve(params.workspaceDir, existingMcpConfigPath);
		mergedConfig = applyMergePatch(mergedConfig, await readExternalMcpConfig(resolvedExistingPath));
	}
	const bundleConfig = loadMergedBundleMcpConfig({
		workspaceDir: params.workspaceDir,
		cfg: params.config,
		mapConfiguredServer: toCliBundleMcpServerConfig
	});
	for (const diagnostic of bundleConfig.diagnostics) params.warn?.(`bundle MCP skipped for ${diagnostic.pluginId}: ${diagnostic.message}`);
	mergedConfig = applyMergePatch(mergedConfig, bundleConfig.config);
	if (params.additionalConfig) mergedConfig = applyMergePatch(mergedConfig, params.additionalConfig);
	return await prepareModeSpecificBundleMcpConfig({
		mode,
		backend: params.backend,
		mergedConfig,
		env: params.env
	});
}
//#endregion
//#region src/agents/cli-runner/prepare.ts
/**
* Prepares CLI backend run context: backend config, prompts, bootstrap context,
* MCP, auth epoch, and reusable session metadata.
*/
const prepareDeps = {
	makeBootstrapWarn,
	resolveBootstrapContextForRun,
	getActiveMcpLoopbackRuntime,
	ensureMcpLoopbackServer,
	createMcpLoopbackServerConfig,
	resolveMcpLoopbackBearerToken,
	resolveMcpLoopbackScopedTools,
	resolveOpenClawReferencePaths: async (params) => (await import("./docs-path-CswT2n8K.js")).resolveOpenClawReferencePaths(params),
	prepareClaudeCliSkillsPlugin,
	claudeCliSessionTranscriptHasContent,
	claudeCliSessionTranscriptHasOrphanedToolUse
};
const CLAUDE_CLI_CONTEXT_MODEL_ALIASES = {
	opus: "claude-opus-4-8",
	"opus-4.8": "claude-opus-4-8",
	"opus-4-8": "claude-opus-4-8",
	"opus-4.7": "claude-opus-4-7",
	"opus-4-7": "claude-opus-4-7",
	"opus-4.6": "claude-opus-4-6",
	"opus-4-6": "claude-opus-4-6",
	sonnet: "claude-sonnet-4-6",
	"sonnet-4.6": "claude-sonnet-4-6",
	"sonnet-4-6": "claude-sonnet-4-6"
};
function resolveClaudeCliContextModelId(modelId) {
	const trimmed = modelId.trim();
	return CLAUDE_CLI_CONTEXT_MODEL_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}
/** Returns whether profile-owned prepared execution should skip local CLI epoch hashing. */
function shouldSkipLocalCliCredentialEpoch(params) {
	return Boolean(params.authEpochMode === "profile-only" && params.authProfileId && params.authCredential && params.preparedExecution);
}
/** Builds the complete context required to execute a CLI-backed agent run. */
async function prepareCliRunContext(params) {
	const started = Date.now();
	const workspaceResolution = resolveRunWorkspaceDir({
		workspaceDir: params.workspaceDir,
		sessionKey: params.sessionKey,
		agentId: params.agentId,
		config: params.config
	});
	const resolvedWorkspace = workspaceResolution.workspaceDir;
	const redactedSessionId = redactRunIdentifier(params.sessionId);
	const redactedSessionKey = redactRunIdentifier(params.sessionKey);
	const redactedWorkspace = redactRunIdentifier(resolvedWorkspace);
	if (workspaceResolution.usedFallback) cliBackendLog.warn(`[workspace-fallback] caller=runCliAgent reason=${workspaceResolution.fallbackReason} run=${params.runId} session=${redactedSessionId} sessionKey=${redactedSessionKey} agent=${workspaceResolution.agentId} workspace=${redactedWorkspace}`);
	const workspaceDir = resolvedWorkspace;
	const cwd = params.cwd ? resolveUserPath(params.cwd) : workspaceDir;
	const cwdHash = hashCliSessionText(cwd);
	const backendResolved = resolveCliBackendConfig(params.provider, params.config, { agentId: params.agentId });
	if (!backendResolved) throw new Error(`Unknown CLI backend: ${params.provider}`);
	if (params.toolsAllow !== void 0) throw new Error(`CLI backend ${backendResolved.id} cannot enforce runtime toolsAllow; use an embedded runtime for restricted tool policy`);
	if (params.disableTools === true && backendResolved.nativeToolMode === "always-on") throw new Error(`CLI backend ${backendResolved.id} cannot run with tools disabled because it exposes native tools`);
	const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.config,
		agentId: params.agentId
	});
	const agentDir = resolveAgentDir(params.config ?? {}, sessionAgentId);
	const effectiveAuthProfileId = (params.authProfileId?.trim() || void 0) ?? backendResolved.defaultAuthProfileId?.trim() ?? void 0;
	let authCredential;
	if (effectiveAuthProfileId) authCredential = loadAuthProfileStoreForRuntime(agentDir, {
		readOnly: true,
		externalCli: externalCliDiscoveryForProviderAuth({
			provider: params.provider,
			profileId: effectiveAuthProfileId
		})
	}).profiles[effectiveAuthProfileId];
	const extraSystemPrompt = params.extraSystemPrompt?.trim() ?? "";
	const extraSystemPromptHash = params.extraSystemPromptStatic !== void 0 ? hashCliSessionText(params.extraSystemPromptStatic.trim() || void 0) : hashCliSessionText(extraSystemPrompt);
	const modelId = (params.model ?? "default").trim() || "default";
	const normalizedModel = normalizeCliModel(modelId, backendResolved.config);
	const modelDisplay = `${params.provider}/${modelId}`;
	const isClaudeCli = isClaudeCliProvider(params.provider);
	const modelContextTokens = isClaudeCli ? resolveContextTokensForModel({
		cfg: params.config,
		provider: params.provider,
		model: resolveClaudeCliContextModelId(modelId),
		fallbackContextTokens: 2e5,
		allowAsyncLoad: false
	}) : void 0;
	const contextWindowInfo = resolveContextWindowInfo({
		cfg: params.config,
		provider: params.provider,
		modelId,
		modelContextTokens,
		defaultTokens: DEFAULT_CONTEXT_TOKENS
	});
	const autoReseedHistoryChars = isClaudeCli ? resolveAutoCliSessionReseedHistoryChars(contextWindowInfo.tokens) : void 0;
	const sessionLabel = params.sessionKey ?? params.sessionId;
	const { bootstrapFiles, contextFiles } = await prepareDeps.resolveBootstrapContextForRun({
		workspaceDir,
		config: params.config,
		sessionKey: params.sessionKey,
		sessionId: params.sessionId,
		agentId: sessionAgentId,
		contextMode: params.bootstrapContextMode,
		runKind: params.bootstrapContextRunKind,
		warn: prepareDeps.makeBootstrapWarn({
			sessionLabel,
			workspaceDir,
			warn: (message) => cliBackendLog.warn(message)
		})
	});
	const bootstrapMaxChars = resolveBootstrapMaxChars(params.config, sessionAgentId);
	const bootstrapTotalMaxChars = resolveBootstrapTotalMaxChars(params.config, sessionAgentId);
	const bootstrapAnalysis = analyzeBootstrapBudget({
		files: buildBootstrapInjectionStats({
			bootstrapFiles,
			injectedFiles: contextFiles
		}),
		bootstrapMaxChars,
		bootstrapTotalMaxChars
	});
	const bootstrapPromptWarningMode = resolveBootstrapPromptTruncationWarningMode(params.config);
	const bootstrapPromptWarning = buildBootstrapPromptWarning({
		analysis: bootstrapAnalysis,
		mode: bootstrapPromptWarningMode,
		seenSignatures: params.bootstrapPromptWarningSignaturesSeen,
		previousSignature: params.bootstrapPromptWarningSignature
	});
	const bundleMcpEnabled = backendResolved.bundleMcp && params.disableTools !== true;
	let mcpLoopbackRuntime = bundleMcpEnabled ? prepareDeps.getActiveMcpLoopbackRuntime() : void 0;
	if (bundleMcpEnabled && !mcpLoopbackRuntime) {
		try {
			await prepareDeps.ensureMcpLoopbackServer();
		} catch (error) {
			cliBackendLog.warn(`mcp loopback server failed to start: ${String(error)}`);
		}
		mcpLoopbackRuntime = prepareDeps.getActiveMcpLoopbackRuntime();
	}
	const preparedBackend = await prepareCliBundleMcpConfig({
		enabled: bundleMcpEnabled,
		mode: backendResolved.bundleMcpMode,
		backend: backendResolved.config,
		workspaceDir,
		config: params.config,
		additionalConfig: mcpLoopbackRuntime ? prepareDeps.createMcpLoopbackServerConfig(mcpLoopbackRuntime.port) : void 0,
		env: mcpLoopbackRuntime ? {
			OPENCLAW_MCP_TOKEN: prepareDeps.resolveMcpLoopbackBearerToken(mcpLoopbackRuntime, params.senderIsOwner === true),
			OPENCLAW_MCP_AGENT_ID: sessionAgentId ?? "",
			OPENCLAW_MCP_ACCOUNT_ID: params.agentAccountId ?? "",
			OPENCLAW_MCP_SESSION_KEY: params.sessionKey ?? "",
			OPENCLAW_MCP_MESSAGE_CHANNEL: params.messageChannel ?? params.messageProvider ?? "",
			OPENCLAW_MCP_CURRENT_CHANNEL_ID: params.currentChannelId ?? "",
			OPENCLAW_MCP_CURRENT_THREAD_TS: params.currentThreadTs ?? "",
			OPENCLAW_MCP_CURRENT_MESSAGE_ID: params.currentMessageId != null ? String(params.currentMessageId) : "",
			OPENCLAW_MCP_CURRENT_INBOUND_AUDIO: params.currentInboundAudio === true ? "true" : "",
			OPENCLAW_MCP_INBOUND_EVENT_KIND: params.currentInboundEventKind ?? "",
			OPENCLAW_MCP_SOURCE_REPLY_DELIVERY_MODE: params.sourceReplyDeliveryMode ?? ""
		} : void 0,
		warn: (message) => cliBackendLog.warn(message)
	});
	const preparedExecution = await backendResolved.prepareExecution?.({
		config: params.config,
		workspaceDir,
		agentDir,
		provider: params.provider,
		modelId,
		authProfileId: effectiveAuthProfileId
	});
	const skipLocalCredentialEpoch = shouldSkipLocalCliCredentialEpoch({
		authEpochMode: backendResolved.authEpochMode,
		authProfileId: effectiveAuthProfileId,
		authCredential,
		preparedExecution
	});
	const authEpoch = await resolveCliAuthEpoch({
		provider: params.provider,
		authProfileId: effectiveAuthProfileId,
		skipLocalCredential: skipLocalCredentialEpoch
	});
	const preparedBackendEnv = preparedExecution?.env && Object.keys(preparedExecution.env).length > 0 ? {
		...preparedBackend.env,
		...preparedExecution.env
	} : preparedBackend.env;
	const preparedBackendCleanup = preparedBackend.cleanup || preparedExecution?.cleanup ? async () => {
		try {
			await preparedExecution?.cleanup?.();
		} finally {
			await preparedBackend.cleanup?.();
		}
	} : void 0;
	const claudeSkillsPlugin = await prepareDeps.prepareClaudeCliSkillsPlugin({
		backendId: backendResolved.id,
		skillsSnapshot: params.skillsSnapshot
	});
	const preparedCleanup = preparedBackendCleanup || claudeSkillsPlugin.args.length > 0 ? async () => {
		try {
			await claudeSkillsPlugin.cleanup();
		} finally {
			await preparedBackendCleanup?.();
		}
	} : void 0;
	const preparedBackendClearEnv = [...preparedBackend.backend.clearEnv ?? [], ...preparedExecution?.clearEnv ?? []];
	const preparedBackendFinal = {
		...preparedBackend,
		backend: {
			...preparedBackend.backend,
			...preparedBackendClearEnv.length > 0 ? { clearEnv: uniqueStrings(preparedBackendClearEnv) } : {}
		},
		...preparedBackendEnv ? { env: preparedBackendEnv } : {},
		...preparedCleanup ? { cleanup: preparedCleanup } : {}
	};
	const promptTools = bundleMcpEnabled && mcpLoopbackRuntime ? prepareDeps.resolveMcpLoopbackScopedTools({
		cfg: params.config ?? getRuntimeConfig(),
		sessionKey: params.sessionKey ?? "",
		messageProvider: params.messageChannel ?? params.messageProvider,
		currentChannelId: params.currentChannelId,
		currentThreadTs: params.currentThreadTs,
		currentMessageId: params.currentMessageId,
		currentInboundAudio: params.currentInboundAudio,
		accountId: params.agentAccountId,
		inboundEventKind: params.currentInboundEventKind,
		sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
		senderIsOwner: params.senderIsOwner
	}).tools : [];
	const promptToolNamesHash = bundleMcpEnabled && mcpLoopbackRuntime ? hashCliSessionText(JSON.stringify(promptTools.map((tool) => tool.name).toSorted())) : void 0;
	const reusableCliSessionCandidate = params.cliSessionBinding ? resolveCliSessionReuse({
		binding: params.cliSessionBinding,
		authProfileId: effectiveAuthProfileId,
		authEpoch,
		authEpochVersion: 5,
		extraSystemPromptHash,
		promptToolNamesHash,
		cwdHash,
		mcpConfigHash: preparedBackendFinal.mcpConfigHash,
		mcpResumeHash: preparedBackendFinal.mcpResumeHash
	}) : params.cliSessionId ? { sessionId: params.cliSessionId } : {};
	const candidateClaudeCliSessionId = reusableCliSessionCandidate.sessionId?.trim() || void 0;
	const hasClaudeCliCandidate = candidateClaudeCliSessionId !== void 0 && isClaudeCliProvider(params.provider);
	const claudeCliTranscriptMissing = hasClaudeCliCandidate && !await prepareDeps.claudeCliSessionTranscriptHasContent({
		sessionId: candidateClaudeCliSessionId,
		workspaceDir: cwd
	});
	const claudeCliTranscriptOrphanedToolUse = hasClaudeCliCandidate && !claudeCliTranscriptMissing && await prepareDeps.claudeCliSessionTranscriptHasOrphanedToolUse({
		sessionId: candidateClaudeCliSessionId,
		workspaceDir: cwd
	});
	const claudeCliInvalidatedReason = claudeCliTranscriptMissing ? "missing-transcript" : claudeCliTranscriptOrphanedToolUse ? "orphaned-tool-use" : void 0;
	const reusableCliSession = claudeCliInvalidatedReason ? { invalidatedReason: claudeCliInvalidatedReason } : reusableCliSessionCandidate;
	if (reusableCliSession.invalidatedReason) cliBackendLog.info(`cli session reset: provider=${params.provider} reason=${reusableCliSession.invalidatedReason}`);
	let openClawHistoryMessages;
	const loadOpenClawHistoryMessages = async () => {
		openClawHistoryMessages ??= await loadCliSessionHistoryMessages({
			sessionId: params.sessionId,
			sessionFile: params.sessionFile,
			sessionKey: params.sessionKey,
			agentId: params.agentId,
			config: params.config
		});
		return openClawHistoryMessages;
	};
	const heartbeatPrompt = resolveHeartbeatPromptForSystemPrompt({
		config: params.config,
		agentId: sessionAgentId,
		defaultAgentId
	});
	const openClawReferences = await prepareDeps.resolveOpenClawReferencePaths({
		workspaceDir,
		argv1: process.argv[1],
		cwd,
		moduleUrl: import.meta.url
	});
	const skillsPrompt = resolveSkillsPromptForRun({
		skillsSnapshot: params.skillsSnapshot,
		workspaceDir,
		config: params.config,
		agentId: sessionAgentId
	});
	const systemPromptSkillsPrompt = claudeSkillsPlugin.args.length > 0 ? "" : skillsPrompt;
	const builtSystemPrompt = buildCliAgentSystemPrompt({
		workspaceDir,
		cwd,
		config: params.config,
		defaultThinkLevel: params.thinkLevel,
		extraSystemPrompt,
		sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
		silentReplyPromptMode: params.silentReplyPromptMode,
		ownerNumbers: params.ownerNumbers,
		heartbeatPrompt,
		docsPath: openClawReferences.docsPath ?? void 0,
		sourcePath: openClawReferences.sourcePath ?? void 0,
		skillsPrompt: systemPromptSkillsPrompt,
		tools: promptTools,
		contextFiles,
		modelDisplay,
		agentId: sessionAgentId
	});
	let systemPrompt = backendResolved.transformSystemPrompt?.({
		config: params.config,
		workspaceDir,
		provider: params.provider,
		modelId,
		modelDisplay,
		agentId: sessionAgentId,
		systemPrompt: builtSystemPrompt
	}) ?? builtSystemPrompt;
	let preparedPrompt = params.prompt;
	const hookRunner = getGlobalHookRunner();
	try {
		const hookResult = await resolvePromptBuildHookResult({
			config: params.config ?? getRuntimeConfig(),
			prompt: params.prompt,
			messages: await loadOpenClawHistoryMessages(),
			hookCtx: {
				runId: params.runId,
				agentId: sessionAgentId,
				sessionKey: params.sessionKey,
				sessionId: params.sessionId,
				workspaceDir,
				modelProviderId: params.provider,
				modelId,
				trigger: params.trigger,
				...buildAgentHookContextChannelFields(params)
			},
			hookRunner
		});
		if (hookResult.prependContext) preparedPrompt = `${hookResult.prependContext}\n\n${preparedPrompt}`;
		if (hookResult.appendContext) preparedPrompt = `${preparedPrompt}\n\n${hookResult.appendContext}`;
		const hookSystemPrompt = hookResult.systemPrompt?.trim();
		if (hookSystemPrompt) systemPrompt = hookSystemPrompt;
		systemPrompt = composeSystemPromptWithHookContext({
			baseSystemPrompt: systemPrompt,
			prependSystemContext: hookResult.prependSystemContext,
			appendSystemContext: hookResult.appendSystemContext
		}) ?? systemPrompt;
		const mediaTaskSystemPromptAddition = resolveAttemptMediaTaskSystemPromptAddition({
			sessionKey: params.sessionKey,
			trigger: params.trigger
		});
		if (mediaTaskSystemPromptAddition) systemPrompt = prependSystemPromptAddition({
			systemPrompt: ensureSystemPromptCacheBoundary(systemPrompt),
			systemPromptAddition: mediaTaskSystemPromptAddition
		});
	} catch (error) {
		cliBackendLog.warn(`cli prompt-build hook preparation failed: ${String(error)}`);
	}
	const fullCurrentInboundPrompt = buildCurrentInboundPrompt({
		context: params.currentInboundContext,
		prompt: preparedPrompt
	});
	const runCurrentInboundPrompt = buildCurrentInboundPrompt({
		context: params.currentInboundContext,
		prompt: preparedPrompt,
		preferResumableText: params.currentInboundEventKind === "room_event" && Boolean(reusableCliSession.sessionId)
	});
	const historyPromptCurrentTurn = annotateInterSessionPromptText(fullCurrentInboundPrompt, params.inputProvenance);
	preparedPrompt = annotateInterSessionPromptText(runCurrentInboundPrompt, params.inputProvenance);
	const allowRawTranscriptReseed = backendResolved.config.reseedFromRawTranscriptWhenUncompacted === true;
	const rawTranscriptReseedReason = reusableCliSession.sessionId ? "session-expired" : reusableCliSession.invalidatedReason;
	const openClawHistoryPrompt = !reusableCliSession.sessionId || allowRawTranscriptReseed ? buildCliSessionHistoryPrompt({
		messages: await loadCliSessionReseedMessages({
			sessionId: params.sessionId,
			sessionFile: params.sessionFile,
			sessionKey: params.sessionKey,
			agentId: params.agentId,
			config: params.config,
			allowRawTranscriptReseed,
			rawTranscriptReseedReason
		}),
		prompt: historyPromptCurrentTurn,
		maxHistoryChars: autoReseedHistoryChars
	}) : void 0;
	const systemPromptWithReplacements = applyPluginTextReplacements(systemPrompt, backendResolved.textTransforms?.input);
	systemPrompt = appendModelIdentitySystemPrompt({
		systemPrompt: buildModelIdentityPromptLine(modelDisplay) && systemPromptWithReplacements.trim().length > 0 ? ensureSystemPromptCacheBoundary(systemPromptWithReplacements) : systemPromptWithReplacements,
		model: modelDisplay
	});
	const systemPromptReport = buildSystemPromptReport({
		source: "run",
		generatedAt: Date.now(),
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		provider: params.provider,
		model: modelId,
		workspaceDir,
		bootstrapMaxChars,
		bootstrapTotalMaxChars,
		bootstrapTruncation: buildBootstrapTruncationReportMeta({
			analysis: bootstrapAnalysis,
			warningMode: bootstrapPromptWarningMode,
			warning: bootstrapPromptWarning
		}),
		sandbox: {
			mode: "off",
			sandboxed: false
		},
		systemPrompt,
		bootstrapFiles,
		injectedFiles: contextFiles,
		skillsPrompt: systemPromptSkillsPrompt,
		tools: promptTools,
		currentTurn: {
			...params.currentInboundEventKind ? { kind: params.currentInboundEventKind } : {},
			promptChars: preparedPrompt.length,
			runtimeContextChars: 0
		}
	});
	const contextEngineConfig = params.config ?? getRuntimeConfig();
	try {
		ensureContextEnginesInitialized();
		const { sessionAgentId: contextEngineSessionAgentId } = resolveSessionAgentIds({
			sessionKey: params.sessionKey,
			config: contextEngineConfig,
			agentId: params.agentId
		});
		const resolvedContextEngine = await resolveContextEngine(contextEngineConfig, {
			agentDir: resolveAgentDir(contextEngineConfig, contextEngineSessionAgentId),
			workspaceDir
		});
		const contextEngine = resolvedContextEngine.info.id !== "legacy" ? resolvedContextEngine : void 0;
		if (contextEngine) assertContextEngineHostSupport({
			contextEngine,
			operation: "agent-run",
			host: buildGenericCliContextEngineHostSupport({
				backendId: backendResolved.id,
				capabilities: backendResolved.contextEngineHostCapabilities
			})
		});
		const hadSessionFile = await hasCliSessionTranscript({
			sessionId: params.sessionId,
			sessionFile: params.sessionFile,
			sessionKey: params.sessionKey,
			agentId: params.agentId,
			config: contextEngineConfig
		});
		const contextEngineTurnPrompt = params.transcriptPrompt ?? params.prompt;
		return {
			params: {
				...params,
				config: contextEngineConfig,
				prompt: preparedPrompt
			},
			effectiveAuthProfileId,
			started,
			workspaceDir,
			cwd,
			backendResolved,
			preparedBackend: preparedBackendFinal,
			reusableCliSession,
			hadSessionFile,
			contextEngineConfig,
			contextEngine,
			contextEngineTurnPrompt,
			modelId,
			normalizedModel,
			contextWindowInfo,
			systemPrompt,
			systemPromptReport,
			claudeSkillsPluginArgs: claudeSkillsPlugin.args,
			bootstrapPromptWarningLines: bootstrapPromptWarning.lines,
			...openClawHistoryPrompt ? { openClawHistoryPrompt } : {},
			heartbeatPrompt,
			authEpoch,
			authEpochVersion: 5,
			extraSystemPromptHash,
			promptToolNamesHash,
			cwdHash
		};
	} catch (err) {
		try {
			await preparedBackendFinal.cleanup?.();
		} catch (cleanupErr) {
			cliBackendLog.warn(`cli backend cleanup after prepare failure failed: ${String(cleanupErr)}`);
		}
		throw err;
	}
}
//#endregion
export { prepareCliRunContext };
