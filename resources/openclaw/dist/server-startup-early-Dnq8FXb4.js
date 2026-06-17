import { o as resolveCronJobsStorePath } from "./store-_jAmB352.js";
//#region src/gateway/server-startup-early.ts
const loadRemoteSkillsRuntimeModule = async () => await import("./remote-BmS7hfeI.js");
/** Measure an early-startup step when tracing is enabled, otherwise run it directly. */
async function measureStartup(startupTrace, name, run) {
	return startupTrace ? startupTrace.measure(name, run) : await run();
}
/** Start plugin discovery and return the Bonjour shutdown callback when discovery is active. */
async function startGatewayPluginDiscovery(params) {
	if (params.minimalTestGateway) return null;
	const machineDisplayName = await measureStartup(params.startupTrace, "runtime.early.discovery.machine-name", async () => (await import("./machine-name-DjpHyjJG.js")).getMachineDisplayName());
	return await measureStartup(params.startupTrace, "runtime.early.discovery.start", async () => {
		const { startGatewayDiscovery } = await import("./server-discovery-runtime-DBeWDB6Y.js");
		return (await startGatewayDiscovery({
			machineDisplayName,
			port: params.port,
			gatewayTls: params.gatewayTls.enabled ? {
				enabled: true,
				fingerprintSha256: params.gatewayTls.fingerprintSha256
			} : void 0,
			gatewayDirectReachable: params.gatewayDirectReachable,
			wideAreaDiscoveryEnabled: params.cfgAtStart.discovery?.wideArea?.enabled === true,
			wideAreaDiscoveryDomain: params.cfgAtStart.discovery?.wideArea?.domain,
			tailscaleMode: params.tailscaleMode,
			mdnsMode: params.cfgAtStart.discovery?.mdns?.mode,
			gatewayDiscoveryServices: params.pluginRegistry?.gatewayDiscoveryServices,
			logDiscovery: params.logDiscovery
		})).bonjourStop;
	});
}
/** Start early Gateway side runtimes before the main server is fully ready. */
async function startGatewayEarlyRuntime(params) {
	const bonjourStop = await measureStartup(params.startupTrace, "runtime.early.discovery", () => startGatewayPluginDiscovery(params));
	let getActiveTaskCount = () => 0;
	if (!params.minimalTestGateway) {
		const [{ primeRemoteSkillsCache, setSkillsRemoteRegistry }, taskRegistryMaintenance] = await measureStartup(params.startupTrace, "runtime.early.lazy-runtime-imports", () => Promise.all([loadRemoteSkillsRuntimeModule(), import("./task-registry.maintenance-DciQfQc1.js")]));
		setSkillsRemoteRegistry(params.nodeRegistry);
		primeRemoteSkillsCache();
		taskRegistryMaintenance.configureTaskRegistryMaintenance({
			cronStorePath: resolveCronJobsStorePath(params.cfgAtStart.cron?.store),
			runtimeAuthoritative: true
		});
		taskRegistryMaintenance.startTaskRegistryMaintenance();
		getActiveTaskCount = () => taskRegistryMaintenance.getInspectableActiveTaskRestartBlockers().length;
	}
	const skillsChangeUnsub = params.minimalTestGateway ? () => {} : await measureStartup(params.startupTrace, "runtime.early.skills-listener", async () => {
		const [{ registerSkillsChangeListener }, { refreshRemoteBinsForConnectedNodes }] = await Promise.all([import("./refresh-DsdbR1sW.js"), loadRemoteSkillsRuntimeModule()]);
		return registerSkillsChangeListener((event) => {
			if (event.reason === "remote-node") return;
			const existingTimer = params.getSkillsRefreshTimer();
			if (existingTimer) clearTimeout(existingTimer);
			const nextTimer = setTimeout(() => {
				params.setSkillsRefreshTimer(null);
				refreshRemoteBinsForConnectedNodes(params.getRuntimeConfig());
			}, params.skillsRefreshDelayMs);
			params.setSkillsRefreshTimer(nextTimer);
		});
	});
	const startMaintenance = async () => {
		if (params.minimalTestGateway) return null;
		return await measureStartup(params.startupTrace, "post-ready.maintenance", async () => {
			const { startGatewayMaintenanceTimers } = await import("./server-maintenance-B4BZBcb0.js");
			return startGatewayMaintenanceTimers({
				broadcast: params.broadcast,
				nodeSendToAllSubscribed: params.nodeSendToAllSubscribed,
				getPresenceVersion: params.getPresenceVersion,
				getHealthVersion: params.getHealthVersion,
				refreshGatewayHealthSnapshot: params.refreshGatewayHealthSnapshot,
				logHealth: params.logHealth,
				dedupe: params.dedupe,
				chatAbortControllers: params.chatAbortControllers,
				chatRunState: params.chatRunState,
				chatRunBuffers: params.chatRunBuffers,
				chatDeltaSentAt: params.chatDeltaSentAt,
				chatDeltaLastBroadcastLen: params.chatDeltaLastBroadcastLen,
				removeChatRun: params.removeChatRun,
				agentRunSeq: params.agentRunSeq,
				nodeSendToSession: params.nodeSendToSession,
				...typeof params.mediaCleanupTtlMs === "number" ? { mediaCleanupTtlMs: params.mediaCleanupTtlMs } : {}
			});
		});
	};
	return {
		bonjourStop,
		getActiveTaskCount,
		skillsChangeUnsub,
		startMaintenance
	};
}
//#endregion
export { startGatewayEarlyRuntime, startGatewayPluginDiscovery };
