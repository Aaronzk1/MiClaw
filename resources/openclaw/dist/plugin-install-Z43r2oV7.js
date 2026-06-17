import { t as createSubsystemLogger } from "./subsystem-BzXSmsuh.js";
import "./agent-scope-MrLta7Pq.js";
import { c as resolveDefaultAgentId, o as resolveAgentWorkspaceDir } from "./agent-scope-config-CgCYpZfK.js";
import { A as resolveConfiguredChannelPluginIds, M as resolveDiscoverableScopedChannelPluginIds } from "./gateway-startup-plugin-ids-3X_G47Qt.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-pAtqig-B.js";
import { c as loadOpenClawPlugins } from "./loader-Dp13N9qc.js";
import "./channel-plugin-ids-yxLDmEfb.js";
import { t as ensureOnboardingPluginInstalled } from "./onboarding-plugin-install-I9ICGLi9.js";
import { t as getTrustedChannelPluginCatalogEntry } from "./trusted-catalog-LdIzL72U.js";
//#region src/plugins/logger.ts
/** Adapts a generic logger to the plugin loader logger interface. */
function createPluginLoaderLogger(logger) {
	return {
		info: (msg) => logger.info(msg),
		warn: (msg) => logger.warn(msg),
		error: (msg) => logger.error(msg),
		debug: (msg) => logger.debug?.(msg)
	};
}
//#endregion
//#region src/commands/channel-setup/plugin-install.ts
function toOnboardingPluginInstallEntry(entry) {
	return {
		pluginId: entry.pluginId ?? entry.id,
		label: entry.meta.label,
		install: entry.install,
		...entry.trustedSourceLinkedOfficialInstall ? { trustedSourceLinkedOfficialInstall: true } : {}
	};
}
/** Install or reuse the plugin package required by a trusted channel catalog entry. */
async function ensureChannelSetupPluginInstalled(params) {
	const result = await ensureOnboardingPluginInstalled({
		cfg: params.cfg,
		entry: toOnboardingPluginInstallEntry(params.entry),
		prompter: params.prompter,
		runtime: params.runtime,
		workspaceDir: params.workspaceDir,
		...params.promptInstall !== void 0 ? { promptInstall: params.promptInstall } : {},
		...params.autoConfirmSingleSource !== void 0 ? { autoConfirmSingleSource: params.autoConfirmSingleSource } : {}
	});
	return {
		cfg: result.cfg,
		installed: result.installed,
		pluginId: result.pluginId,
		status: result.status
	};
}
/** Reload configured channel setup plugins after config or install-record changes. */
function reloadChannelSetupPluginRegistry(params) {
	loadChannelSetupPluginRegistry(params);
}
function loadChannelSetupPluginRegistry(params) {
	const autoEnabled = applyPluginAutoEnable({
		config: params.cfg,
		env: process.env
	});
	const resolvedConfig = autoEnabled.config;
	const workspaceDir = params.workspaceDir ?? resolveAgentWorkspaceDir(resolvedConfig, resolveDefaultAgentId(resolvedConfig));
	const onlyPluginIds = params.onlyPluginIds ?? resolveConfiguredChannelPluginIds({
		config: resolvedConfig,
		activationSourceConfig: params.cfg,
		workspaceDir,
		env: process.env
	});
	const log = createSubsystemLogger("plugins");
	return loadOpenClawPlugins({
		config: resolvedConfig,
		activationSourceConfig: params.cfg,
		autoEnabledReasons: autoEnabled.autoEnabledReasons,
		workspaceDir,
		cache: false,
		logger: createPluginLoaderLogger(log),
		onlyPluginIds,
		includeSetupOnlyChannelPlugins: true,
		forceSetupOnlyChannelPlugins: params.forceSetupOnlyChannelPlugins,
		activate: params.activate
	});
}
function resolveScopedChannelPluginId(params) {
	const explicitPluginId = params.pluginId?.trim();
	if (explicitPluginId) return explicitPluginId;
	return getTrustedChannelPluginCatalogEntry(params.channel, {
		cfg: params.cfg,
		workspaceDir: params.workspaceDir
	})?.pluginId ?? resolveUniqueManifestScopedChannelPluginId(params);
}
function resolveUniqueManifestScopedChannelPluginId(params) {
	const matches = resolveDiscoverableScopedChannelPluginIds({
		config: params.cfg,
		channelIds: [params.channel],
		workspaceDir: params.workspaceDir,
		env: process.env
	});
	return matches.length === 1 ? matches[0] : void 0;
}
/** Reload only the plugin that can contribute setup support for one channel id. */
function reloadChannelSetupPluginRegistryForChannel(params) {
	const scopedPluginId = resolveScopedChannelPluginId({
		cfg: params.cfg,
		channel: params.channel,
		pluginId: params.pluginId,
		workspaceDir: params.workspaceDir
	});
	loadChannelSetupPluginRegistry({
		...params,
		...scopedPluginId ? { onlyPluginIds: [scopedPluginId] } : {}
	});
}
/** Load an inactive setup-plugin registry snapshot for resolving a channel without side effects. */
function loadChannelSetupPluginRegistrySnapshotForChannel(params) {
	const scopedPluginId = resolveScopedChannelPluginId({
		cfg: params.cfg,
		channel: params.channel,
		pluginId: params.pluginId,
		workspaceDir: params.workspaceDir
	});
	return loadChannelSetupPluginRegistry({
		...params,
		...scopedPluginId ? { onlyPluginIds: [scopedPluginId] } : {},
		activate: false
	});
}
//#endregion
export { reloadChannelSetupPluginRegistryForChannel as i, loadChannelSetupPluginRegistrySnapshotForChannel as n, reloadChannelSetupPluginRegistry as r, ensureChannelSetupPluginInstalled as t };
