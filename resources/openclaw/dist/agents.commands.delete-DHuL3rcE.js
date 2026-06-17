import { t as formatCliCommand } from "./command-format-CKGmlpAQ.js";
import { n as defaultRuntime, r as writeRuntimeJson } from "./runtime-B4lgFmsS.js";
import "./agent-scope-MrLta7Pq.js";
import { t as DEFAULT_AGENT_ID, u as normalizeAgentId } from "./session-key-B_NoIfpX.js";
import { a as resolveAgentDir, o as resolveAgentWorkspaceDir, t as listAgentEntries } from "./agent-scope-config-CgCYpZfK.js";
import { i as replaceConfigFile } from "./config-C9RxTsn1.js";
import { i as GATEWAY_CLIENT_NAMES, r as GATEWAY_CLIENT_MODES } from "./client-info-CcqJJIan.js";
import { f as isGatewayCredentialsRequiredError, m as isGatewayTransportError, o as callGateway } from "./call-B5-GYOlf.js";
import { l as resolveSessionTranscriptsDirForAgent } from "./paths-NEwU8m3X.js";
import "./message-channel-BiOeMu0l.js";
import { t as purgeAgentSessionStoreEntries } from "./sessions-D6zZvoxX.js";
import { S as resolveWorkspaceAttestationPaths, w as shouldRemoveWorkspaceAttestation } from "./workspace-B0bmoo98.js";
import { t as createClackPrompter } from "./clack-prompter-fc9v8HJv.js";
import { r as logConfigUpdated } from "./logging-Cr7I5jF_.js";
import { s as moveToTrash } from "./onboard-helpers-DXyUiHQ-.js";
import { r as requireValidConfigFileSnapshot, t as createQuietRuntime } from "./agents.command-shared-DGOy_cbP.js";
import { a as pruneAgentConfig, r as findAgentEntryIndex } from "./agents.config-DfQl3_hl.js";
import { t as findOverlappingWorkspaceAgentIds } from "./agent-delete-safety-ClMBBhZN.js";
//#region src/commands/agents.commands.delete.ts
async function maybeDeleteAgentThroughGateway(params) {
	try {
		return await callGateway({
			method: "agents.delete",
			params: {
				agentId: params.agentId,
				deleteFiles: params.deleteFiles
			},
			mode: GATEWAY_CLIENT_MODES.CLI,
			clientName: GATEWAY_CLIENT_NAMES.CLI,
			requiredMethods: ["agents.delete"]
		});
	} catch (error) {
		if (isGatewayTransportError(error) || isGatewayCredentialsRequiredError(error)) return null;
		throw error;
	}
}
/** Delete an agent, pruning config plus workspace/session state when it is safe to do so. */
async function agentsDeleteCommand(opts, runtime = defaultRuntime) {
	const configSnapshot = await requireValidConfigFileSnapshot(runtime);
	if (!configSnapshot) return;
	const cfg = configSnapshot.sourceConfig ?? configSnapshot.config;
	const baseHash = configSnapshot.hash;
	const input = opts.id?.trim();
	if (!input) {
		runtime.error(`Agent id is required. Run ${formatCliCommand("openclaw agents list")} to choose one.`);
		runtime.exit(1);
		return;
	}
	const agentId = normalizeAgentId(input);
	if (agentId !== input) runtime.log(`Normalized agent id to "${agentId}".`);
	if (agentId === "main") {
		runtime.error(`"${DEFAULT_AGENT_ID}" cannot be deleted.`);
		runtime.exit(1);
		return;
	}
	if (findAgentEntryIndex(listAgentEntries(cfg), agentId) < 0) {
		runtime.error(`Agent "${agentId}" not found. Run ${formatCliCommand("openclaw agents list")} to see configured agents.`);
		runtime.exit(1);
		return;
	}
	if (!opts.force) {
		if (!process.stdin.isTTY) {
			runtime.error("Non-interactive session. Re-run with --force.");
			runtime.exit(1);
			return;
		}
		if (!await createClackPrompter().confirm({
			message: `Delete agent "${agentId}" and prune workspace/state?`,
			initialValue: false
		})) {
			runtime.log("Cancelled.");
			return;
		}
	}
	const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
	const agentDir = resolveAgentDir(cfg, agentId);
	const sessionsDir = resolveSessionTranscriptsDirForAgent(agentId);
	const result = pruneAgentConfig(cfg, agentId);
	const gatewayResult = await maybeDeleteAgentThroughGateway({
		agentId,
		deleteFiles: true
	});
	if (gatewayResult) {
		const workspaceSharedWith = findOverlappingWorkspaceAgentIds(cfg, agentId, workspaceDir);
		const workspaceRetained = workspaceSharedWith.length > 0;
		if (opts.json) writeRuntimeJson(runtime, {
			agentId,
			workspace: workspaceDir,
			workspaceRetained: workspaceRetained || void 0,
			workspaceRetainedReason: workspaceRetained ? "shared" : void 0,
			workspaceSharedWith: workspaceRetained ? workspaceSharedWith : void 0,
			agentDir,
			sessionsDir,
			removedBindings: gatewayResult.removedBindings,
			removedAllow: result.removedAllow,
			transport: "gateway"
		});
		else runtime.log(`Deleted agent: ${agentId}`);
		return;
	}
	await replaceConfigFile({
		nextConfig: result.config,
		...baseHash !== void 0 ? { baseHash } : {},
		writeOptions: opts.json ? { skipOutputLogs: true } : void 0
	});
	if (!opts.json) logConfigUpdated(runtime);
	await purgeAgentSessionStoreEntries(cfg, agentId);
	const quietRuntime = opts.json ? createQuietRuntime(runtime) : runtime;
	const workspaceSharedWith = findOverlappingWorkspaceAgentIds(cfg, agentId, workspaceDir);
	const workspaceRetained = workspaceSharedWith.length > 0;
	if (workspaceRetained) quietRuntime.log(`Skipped workspace removal (shared with other agents: ${workspaceSharedWith.join(", ")}): ${workspaceDir}`);
	else {
		await moveToTrash(workspaceDir, quietRuntime);
		for (const [index, attestationPath] of resolveWorkspaceAttestationPaths(workspaceDir).entries()) if (await shouldRemoveWorkspaceAttestation(attestationPath, { trustUnknown: index === 0 })) await moveToTrash(attestationPath, quietRuntime);
	}
	await moveToTrash(agentDir, quietRuntime);
	await moveToTrash(sessionsDir, quietRuntime);
	if (opts.json) writeRuntimeJson(runtime, {
		agentId,
		workspace: workspaceDir,
		workspaceRetained: workspaceRetained || void 0,
		workspaceRetainedReason: workspaceRetained ? "shared" : void 0,
		workspaceSharedWith: workspaceRetained ? workspaceSharedWith : void 0,
		agentDir,
		sessionsDir,
		removedBindings: result.removedBindings,
		removedAllow: result.removedAllow
	});
	else runtime.log(`Deleted agent: ${agentId}`);
}
//#endregion
export { agentsDeleteCommand };
