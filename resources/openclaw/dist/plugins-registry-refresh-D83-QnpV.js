import { i as formatErrorMessage } from "./errors-BXgSefBE.js";
import { a as tracePluginLifecyclePhaseAsync } from "./discovery-BDSfxwT6.js";
import { t as loadInstalledPluginIndexInstallRecords } from "./installed-plugin-index-record-reader-CPHayOZI.js";
import { h as refreshPluginRegistry } from "./plugin-registry-ChcJPHWl.js";
import "./installed-plugin-index-records-DXbAzXDd.js";
//#region src/cli/plugins-registry-refresh.ts
/** Refresh persisted plugin registry and clear runtime discovery after a config mutation. */
async function refreshPluginRegistryAfterConfigMutation(params) {
	try {
		const installRecords = params.installRecords ?? await tracePluginLifecyclePhaseAsync("install records load", () => loadInstalledPluginIndexInstallRecords(params.env ? { env: params.env } : {}), { command: params.traceCommand ?? "registry-refresh" });
		await tracePluginLifecyclePhaseAsync("registry refresh", () => refreshPluginRegistry({
			config: params.config,
			reason: params.reason,
			installRecords,
			...params.policyPluginIds ? { policyPluginIds: params.policyPluginIds } : {},
			...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {},
			...params.env ? { env: params.env } : {}
		}), {
			command: params.traceCommand ?? "registry-refresh",
			reason: params.reason
		});
	} catch (error) {
		params.logger?.warn?.(`Plugin registry refresh failed: ${formatErrorMessage(error)}`);
	}
	if (params.invalidateRuntimeCache !== false) await invalidatePluginRuntimeDiscoveryAfterConfigMutation(params);
}
async function invalidatePluginRuntimeDiscoveryAfterConfigMutation(params) {
	try {
		const { clearPluginRegistryLoadCache } = await import("./plugins/loader.js");
		clearPluginRegistryLoadCache();
	} catch (error) {
		params.logger?.warn?.(`Plugin runtime cache invalidation failed: ${formatErrorMessage(error)}`);
	}
}
//#endregion
export { refreshPluginRegistryAfterConfigMutation as t };
