import { y as resolveSessionAgentIds } from "./agent-scope-MrLta7Pq.js";
import { N as listRegisteredPluginAgentPromptGuidance } from "./command-registration-Bp1_oQY0.js";
import { c as resolveDefaultModelForAgent } from "./model-selection-CA_65iXi.js";
import { n as resolveSandboxRuntimeStatus } from "./runtime-status-DNNoBvYA.js";
import { t as isAcpRuntimeSpawnAvailable } from "./availability-CRegrZ4z.js";
import { u as resolveSkillsPromptForRun } from "./workspace-_gXfieOh.js";
import { n as resolveSandboxSkillRuntimeInputs, r as resolveEmbeddedRunSkillEntries, t as mapSandboxSkillEntriesForPrompt } from "./sandbox-skills-Bn2SzSN6.js";
import { t as createOpenClawCodingTools } from "./agent-tools-uBjiioJ8.js";
import { a as ensureSandboxWorkspaceForSession } from "./sandbox-BQ4p-0vf.js";
import { a as resolveBootstrapContextForRun } from "./bootstrap-files-DiRvjZAg.js";
import { i as resolveAgentPromptSurfaceForSessionKey, t as buildConfiguredAgentSystemPrompt } from "./system-prompt-config-CVau6v04.js";
import { t as buildSystemPromptParams } from "./system-prompt-params-DZ5pfh4w.js";
import { t as canExecRequestNode } from "./exec-defaults-BenGbA5f.js";
import { n as resolveEmbeddedFullAccessState } from "./sandbox-info-Dn4KL4Mg.js";
import { t as resolveRuntimePolicySessionKey } from "./runtime-policy-session-key-1G2-vCcs.js";
import { t as getRemoteSkillEligibility } from "./remote-DoOmoEi1.js";
import { n as resolveReusableWorkspaceSkillSnapshot } from "./session-snapshot-CO_70mfK.js";
//#region src/auto-reply/reply/commands-system-prompt.ts
function resolveCommandSkillsEligibility(params) {
	try {
		return { remote: getRemoteSkillEligibility({ advertiseExecNode: canExecRequestNode({
			cfg: params.config,
			sessionEntry: params.sessionEntry,
			sessionKey: params.sessionKey,
			agentId: params.agentId
		}) }) };
	} catch {
		try {
			return { remote: getRemoteSkillEligibility({ advertiseExecNode: false }) };
		} catch {
			return {};
		}
	}
}
async function resolveCommandSkillsPrompt(params) {
	if (params.sandboxed) try {
		const sandboxWorkspace = await ensureSandboxWorkspaceForSession({
			config: params.config,
			sessionKey: params.sessionKey,
			workspaceDir: params.workspaceDir
		});
		if (!sandboxWorkspace) return "";
		if (sandboxWorkspace.containerWorkdir) {
			const { skillsEligibility, skillsPromptWorkspaceDir, skillsSnapshot: skillsSnapshotForRun, skillsWorkspaceDir, workspaceOnly } = resolveSandboxSkillRuntimeInputs({
				sandbox: {
					enabled: true,
					containerWorkdir: sandboxWorkspace.containerWorkdir,
					...sandboxWorkspace.skillsEligibility ? { skillsEligibility: sandboxWorkspace.skillsEligibility } : {},
					...sandboxWorkspace.skillsWorkspaceDir ? { skillsWorkspaceDir: sandboxWorkspace.skillsWorkspaceDir } : {},
					...sandboxWorkspace.workspaceAccess ? { workspaceAccess: sandboxWorkspace.workspaceAccess } : {}
				},
				effectiveWorkspace: sandboxWorkspace.workspaceDir
			});
			const { shouldLoadSkillEntries, skillEntries } = resolveEmbeddedRunSkillEntries({
				workspaceDir: skillsWorkspaceDir,
				config: params.config,
				agentId: params.agentId,
				eligibility: skillsEligibility,
				skillsSnapshot: skillsSnapshotForRun,
				workspaceOnly
			});
			return resolveSkillsPromptForRun({
				skillsSnapshot: skillsSnapshotForRun,
				entries: mapSandboxSkillEntriesForPrompt({
					entries: shouldLoadSkillEntries ? skillEntries : void 0,
					skillsWorkspaceDir,
					skillsPromptWorkspaceDir
				}),
				config: params.config,
				workspaceDir: skillsPromptWorkspaceDir,
				agentId: params.agentId,
				eligibility: skillsEligibility
			});
		}
	} catch {
		return "";
	}
	try {
		return resolveReusableWorkspaceSkillSnapshot({
			workspaceDir: params.workspaceDir,
			config: params.config,
			agentId: params.agentId,
			eligibility: params.eligibility,
			watch: false
		}).snapshot.prompt ?? "";
	} catch {
		return "";
	}
}
async function resolveCommandsSystemPromptBundle(params) {
	const workspaceDir = params.workspaceDir;
	const targetSessionEntry = params.sessionStore?.[params.sessionKey] ?? params.sessionEntry;
	const { sessionAgentId } = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.cfg,
		agentId: params.agentId
	});
	const { bootstrapFiles, contextFiles: injectedFiles } = await resolveBootstrapContextForRun({
		workspaceDir,
		config: params.cfg,
		sessionKey: params.sessionKey,
		sessionId: targetSessionEntry?.sessionId,
		agentId: sessionAgentId
	});
	const toolPolicySessionKey = resolveRuntimePolicySessionKey({
		cfg: params.cfg,
		ctx: params.ctx,
		sessionKey: params.sessionKey
	});
	const sandboxRuntime = resolveSandboxRuntimeStatus({
		cfg: params.cfg,
		sessionKey: toolPolicySessionKey
	});
	const skillsEligibility = resolveCommandSkillsEligibility({
		agentId: sessionAgentId,
		config: params.cfg,
		sessionEntry: targetSessionEntry,
		sessionKey: params.sessionKey
	});
	const skillsPrompt = await resolveCommandSkillsPrompt({
		agentId: sessionAgentId,
		config: params.cfg,
		eligibility: skillsEligibility,
		sandboxed: sandboxRuntime.sandboxed,
		sessionKey: toolPolicySessionKey,
		workspaceDir
	});
	const tools = (() => {
		try {
			return createOpenClawCodingTools({
				config: params.cfg,
				agentId: sessionAgentId,
				workspaceDir,
				sessionKey: toolPolicySessionKey,
				allowGatewaySubagentBinding: true,
				messageProvider: params.command.channel,
				groupId: targetSessionEntry?.groupId ?? void 0,
				groupChannel: targetSessionEntry?.groupChannel ?? void 0,
				groupSpace: targetSessionEntry?.space ?? void 0,
				spawnedBy: targetSessionEntry?.spawnedBy ?? void 0,
				senderId: params.command.senderId,
				senderName: params.ctx.SenderName,
				senderUsername: params.ctx.SenderUsername,
				senderE164: params.ctx.SenderE164,
				modelProvider: params.provider,
				modelId: params.model
			});
		} catch {
			return [];
		}
	})();
	const toolNames = tools.map((t) => t.name);
	const promptSurface = resolveAgentPromptSurfaceForSessionKey(params.sessionKey);
	const defaultModelRef = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: sessionAgentId
	});
	const defaultModelLabel = `${defaultModelRef.provider}/${defaultModelRef.model}`;
	const { runtimeInfo, userTimezone, userTime, userTimeFormat } = buildSystemPromptParams({
		config: params.cfg,
		agentId: sessionAgentId,
		workspaceDir,
		cwd: process.cwd(),
		runtime: {
			host: "unknown",
			os: "unknown",
			arch: "unknown",
			node: process.version,
			model: `${params.provider}/${params.model}`,
			defaultModel: defaultModelLabel
		}
	});
	const fullAccessState = resolveEmbeddedFullAccessState({ execElevated: {
		enabled: params.elevated.enabled,
		allowed: params.elevated.allowed,
		defaultLevel: params.resolvedElevatedLevel ?? "off"
	} });
	const sandboxInfo = sandboxRuntime.sandboxed ? {
		enabled: true,
		workspaceDir,
		workspaceAccess: "rw",
		elevated: {
			allowed: params.elevated.allowed,
			defaultLevel: params.resolvedElevatedLevel ?? "off",
			fullAccessAvailable: fullAccessState.available,
			...fullAccessState.blockedReason ? { fullAccessBlockedReason: fullAccessState.blockedReason } : {}
		}
	} : { enabled: false };
	return {
		systemPrompt: buildConfiguredAgentSystemPrompt({
			config: params.cfg,
			agentId: sessionAgentId,
			workspaceDir,
			defaultThinkLevel: params.resolvedThinkLevel,
			reasoningLevel: params.resolvedReasoningLevel,
			extraSystemPrompt: void 0,
			ownerNumbers: void 0,
			reasoningTagHint: false,
			toolNames,
			userTimezone,
			userTime,
			userTimeFormat,
			contextFiles: injectedFiles,
			skillsPrompt,
			heartbeatPrompt: void 0,
			acpEnabled: isAcpRuntimeSpawnAvailable({
				config: params.cfg,
				sandboxed: sandboxRuntime.sandboxed
			}),
			promptSurface,
			nativeCommandGuidanceLines: listRegisteredPluginAgentPromptGuidance({ surface: promptSurface }),
			runtimeInfo,
			sandboxInfo
		}),
		tools,
		skillsPrompt,
		bootstrapFiles,
		injectedFiles,
		sandboxRuntime
	};
}
//#endregion
export { resolveCommandsSystemPromptBundle as t };
