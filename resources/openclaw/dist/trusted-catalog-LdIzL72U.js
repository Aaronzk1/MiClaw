import { s as normalizePluginsConfig, u as resolveEnableState } from "./config-state-CikNNz7T.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-pAtqig-B.js";
import { n as getChannelPluginCatalogEntry, r as listRawChannelPluginCatalogEntries } from "./catalog-Px28uVRt.js";
//#region src/commands/channel-setup/trusted-catalog.ts
function resolveEffectiveTrustConfig(cfg, env) {
	return applyPluginAutoEnable({
		config: cfg,
		env: env ?? process.env
	}).config;
}
function isTrustedWorkspaceChannelCatalogEntry(entry, cfg, env) {
	if (entry?.origin !== "workspace") return true;
	if (!entry.pluginId) return false;
	const effectiveConfig = resolveEffectiveTrustConfig(cfg, env);
	return resolveEnableState(entry.pluginId, "workspace", normalizePluginsConfig(effectiveConfig.plugins)).enabled;
}
/** Resolve a catalog entry, falling back to non-workspace metadata when workspace entry is untrusted. */
function getTrustedChannelPluginCatalogEntry(channelId, params) {
	const candidate = getChannelPluginCatalogEntry(channelId, { workspaceDir: params.workspaceDir });
	if (isTrustedWorkspaceChannelCatalogEntry(candidate, params.cfg, params.env)) return candidate;
	return getChannelPluginCatalogEntry(channelId, {
		workspaceDir: params.workspaceDir,
		excludeWorkspace: true
	});
}
function listChannelPluginCatalogEntriesWithTrustedFallback(params, onMissingFallback) {
	const unfiltered = listRawChannelPluginCatalogEntries({ workspaceDir: params.workspaceDir });
	const fallbackById = new Map(listRawChannelPluginCatalogEntries({
		workspaceDir: params.workspaceDir,
		excludeWorkspace: true
	}).map((entry) => [entry.id, entry]));
	return unfiltered.flatMap((entry) => {
		if (isTrustedWorkspaceChannelCatalogEntry(entry, params.cfg, params.env)) return [entry];
		const fallback = fallbackById.get(entry.id);
		return fallback ? [fallback] : onMissingFallback(entry);
	});
}
/** List trusted catalog entries, dropping untrusted workspace-only shadows. */
function listTrustedChannelPluginCatalogEntries(params) {
	return listChannelPluginCatalogEntriesWithTrustedFallback(params, () => []);
}
/** List setup discovery entries, preserving untrusted workspace-only entries for install prompts. */
function listSetupDiscoveryChannelPluginCatalogEntries(params) {
	return listChannelPluginCatalogEntriesWithTrustedFallback(params, (entry) => [entry]);
}
//#endregion
export { listSetupDiscoveryChannelPluginCatalogEntries as n, listTrustedChannelPluginCatalogEntries as r, getTrustedChannelPluginCatalogEntry as t };
