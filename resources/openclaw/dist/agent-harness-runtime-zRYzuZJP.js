import { l as redactToolDetail } from "./redact-DduLliKq.js";
import "./errors-BXgSefBE.js";
import { y as truncateUtf16Safe } from "./utils-CCC-BEJH.js";
import "./version-Crcn9X9T.js";
import { t as createSubsystemLogger } from "./subsystem-BzXSmsuh.js";
import "./agent-scope-MrLta7Pq.js";
import "./registry-DJ-L47Jb.js";
import { v as listCodexAppServerExtensionFactories } from "./registry-CYsBNH12.js";
import { c as joinPresentTextSegments, t as getGlobalHookRunner } from "./hook-runner-global-BnyQREr6.js";
import "./registry-Dca-zXEr.js";
import "./transcript-Cw-EfeYD.js";
import "./transcript-events-DTn-thXR.js";
import "./session-write-lock-D4phDYfI.js";
import "./model-auth-DVfmdW0b.js";
import { p as queueEmbeddedAgentMessageWithOutcome } from "./runs-B4dP_Q30.js";
import "./usage-C67Kbb7n.js";
import "./heartbeat-tool-response-D6-_RNEN.js";
import "./logger-B8odRltZ.js";
import "./tools-oBw0X8xm.js";
import "./agent-tools.before-tool-call-BkVrW03y.js";
import "./gateway-Dq9H8-iz.js";
import "./nodes-utils-CTBPI5uk.js";
import { r as resolveToolDisplay, t as formatToolDetail } from "./tool-display-CX5DV8AV.js";
import "./streaming-_TVeMLGC.js";
import "./sandbox-BQ4p-0vf.js";
import "./bootstrap-files-DiRvjZAg.js";
import "./embedded-agent-messaging-CprZBAme.js";
import "./embedded-agent-subscribe.tools-CeNC5LI1.js";
import { s as buildAgentHookContext } from "./lifecycle-hook-helpers-BiRlZKs7.js";
import "./tool-schema-projection-DRzFBr6V.js";
import "./tools-C5Dgo3sN.js";
import "./tool-result-middleware-B3Hdp_cV.js";
import { p as wrapPluginSystemContextSection } from "./attempt.prompt-helpers-CgpMNs9B.js";
import "./context-engine-lifecycle-CVy46YJP.js";
import "./attempt.tool-run-context-CJUiBo7z.js";
import "./attempt-tool-construction-plan-C32M6pQQ.js";
import "./result-fallback-classifier-vfh2jCL6.js";
import "./build-LOkd5u9D.js";
import "./agent-dir-compat-BqOAVSjO.js";
import "./hook-helpers-B1pwlijz.js";
import "./native-hook-relay-Df3cOSaT.js";
//#region src/agents/harness/prompt-compaction-hook-helpers.ts
/**
* Agent harness prompt and compaction hook helpers.
*
* Harness runtimes use this to run plugin hooks around prompt construction and
* compaction while keeping hook failures non-fatal.
*/
const log$1 = createSubsystemLogger("agents/harness");
/** Runs before-prompt hooks and returns the adjusted prompt fields. */
async function resolveAgentHarnessBeforePromptBuildResult(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_prompt_build") && !hookRunner?.hasHooks("before_agent_start")) return {
		prompt: params.prompt,
		developerInstructions: params.developerInstructions
	};
	const hookCtx = buildAgentHookContext(params.ctx);
	const promptEvent = {
		prompt: params.prompt,
		messages: params.messages
	};
	const promptBuildResult = hookRunner.hasHooks("before_prompt_build") ? await hookRunner.runBeforePromptBuild(promptEvent, hookCtx).catch((error) => {
		log$1.warn(`before_prompt_build hook failed: ${String(error)}`);
	}) : void 0;
	const beforeAgentStartResult = hookRunner.hasHooks("before_agent_start") ? await hookRunner.runBeforeAgentStart(promptEvent, hookCtx).catch((error) => {
		log$1.warn(`deprecated before_agent_start hook failed during prompt build: ${String(error)}`);
	}) : void 0;
	const systemPrompt = resolvePromptBuildSystemPrompt({
		developerInstructions: params.developerInstructions,
		promptBuildResult,
		beforeAgentStartResult
	});
	return {
		prompt: joinPresentTextSegments([
			promptBuildResult?.prependContext,
			beforeAgentStartResult?.prependContext,
			params.prompt
		]) ?? params.prompt,
		developerInstructions: joinPresentTextSegments([
			wrapPluginSystemContextSection(promptBuildResult?.prependSystemContext),
			wrapPluginSystemContextSection(beforeAgentStartResult?.prependSystemContext),
			systemPrompt,
			wrapPluginSystemContextSection(promptBuildResult?.appendSystemContext),
			wrapPluginSystemContextSection(beforeAgentStartResult?.appendSystemContext)
		]) ?? systemPrompt
	};
}
function resolvePromptBuildSystemPrompt(params) {
	if (typeof params.promptBuildResult?.systemPrompt === "string") return params.promptBuildResult.systemPrompt;
	if (typeof params.beforeAgentStartResult?.systemPrompt === "string") return params.beforeAgentStartResult.systemPrompt;
	return params.developerInstructions;
}
/** Runs best-effort before-compaction hooks for a harness session. */
async function runAgentHarnessBeforeCompactionHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_compaction")) return;
	try {
		await hookRunner.runBeforeCompaction({
			messageCount: params.messages.length,
			messages: params.messages,
			sessionFile: params.sessionFile
		}, buildAgentHookContext(params.ctx));
	} catch (error) {
		log$1.warn(`before_compaction hook failed: ${String(error)}`);
	}
}
/** Runs best-effort after-compaction hooks for a harness session. */
async function runAgentHarnessAfterCompactionHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("after_compaction")) return;
	try {
		await hookRunner.runAfterCompaction({
			messageCount: params.messages.length,
			compactedCount: params.compactedCount,
			sessionFile: params.sessionFile
		}, buildAgentHookContext(params.ctx));
	} catch (error) {
		log$1.warn(`after_compaction hook failed: ${String(error)}`);
	}
}
//#endregion
//#region src/agents/harness/codex-app-server-extensions.ts
/**
* Codex app-server extension runner.
*
* Harness integration uses this to let registered extensions observe and adjust
* tool results before they are returned to the agent runtime.
*/
const log = createSubsystemLogger("agents/harness");
/** Creates a runner that applies registered Codex app-server tool-result extensions. */
function createCodexAppServerToolResultExtensionRunner(ctx, factories = listCodexAppServerExtensionFactories()) {
	const handlers = [];
	const runtime = { on(event, handler) {
		if (event === "tool_result") handlers.push(handler);
	} };
	const initPromise = (async () => {
		for (const factory of factories) await factory(runtime);
	})();
	return { async applyToolResultExtensions(event) {
		await initPromise;
		let current = event.result;
		for (const handler of handlers) try {
			const next = await handler({
				...event,
				result: current
			}, ctx);
			if (next?.result) current = next.result;
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			log.warn(`[codex] tool_result extension failed for ${event.toolName}: ${detail}`);
		}
		return current;
	} };
}
//#endregion
//#region src/plugin-sdk/agent-harness-runtime.ts
/** Default truncation limit for user-facing tool progress output. */
const TOOL_PROGRESS_OUTPUT_MAX_CHARS = 8e3;
/**
* @deprecated Active-run queueing is an internal runtime concern. This legacy
* boolean API only reports immediate queue eligibility and cannot observe async
* runtime rejection; runtime-owned delivery paths should use acceptance-aware
* steering instead of public SDK queueing.
*/
function queueAgentHarnessMessage(sessionId, text, options) {
	return queueEmbeddedAgentMessageWithOutcome(sessionId, text, options).queued;
}
/** Detect prompt image references and load them through the same limits used by embedded runs. */
async function detectAndLoadAgentHarnessPromptImages(params) {
	const [{ resolveImageSanitizationLimits }, { detectAndLoadPromptImages }, { MAX_IMAGE_BYTES }] = await Promise.all([
		import("./image-sanitization-BghTEphW.js"),
		import("./images-CUVaLD2I.js"),
		import("./media-core/constants.js")
	]);
	return detectAndLoadPromptImages({
		prompt: params.prompt,
		workspaceDir: params.workspaceDir,
		model: params.model,
		existingImages: params.existingImages,
		imageOrder: params.imageOrder,
		maxBytes: MAX_IMAGE_BYTES,
		maxDimensionPx: resolveImageSanitizationLimits(params.config).maxDimensionPx,
		workspaceOnly: params.workspaceOnly,
		localRoots: params.localRoots,
		sandbox: params.sandbox
	});
}
/** Load Codex bundle MCP thread config without forcing the heavy config module into SDK imports. */
async function loadCodexBundleMcpThreadConfig(params) {
	const { loadCodexBundleMcpThreadConfig: load } = await import("./codex-mcp-config-DB62Pgk0.js");
	return load(params);
}
/** Infer compact display metadata for one tool invocation from its name and arguments. */
function inferToolMetaFromArgs(toolName, args, options) {
	return formatToolDetail(resolveToolDisplay({
		name: toolName,
		args,
		detailMode: options?.detailMode
	}));
}
/**
* Prepare verbose tool output for user-facing progress messages.
*/
function formatToolProgressOutput(output, options) {
	const trimmed = output.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
	if (!trimmed) return;
	const redacted = redactToolDetail(trimmed);
	const maxChars = options?.maxChars ?? 8e3;
	if (redacted.length <= maxChars) return redacted;
	return `${truncateUtf16Safe(redacted, maxChars)}\n...(truncated)...`;
}
/**
* Classify terminal harness turns that completed without assistant output that
* should advance fallback. Deliberate silent replies such as NO_REPLY count as
* intentional output, while whitespace-only text remains fallback-eligible.
* This is intentionally SDK-level so plugin harness adapters such as Codex
* preserve the same OpenClaw-owned fallback signals as the built-in OpenClaw path
* without re-implementing terminal-result policy.
*/
function classifyAgentHarnessTerminalOutcome(params) {
	if (!params.turnCompleted || params.promptError !== void 0 && params.promptError !== null || hasVisibleAssistantText(params.assistantTexts)) return;
	if (params.planText?.trim()) return "planning-only";
	if (params.reasoningText?.trim()) return "reasoning-only";
	return "empty";
}
function hasVisibleAssistantText(assistantTexts) {
	return assistantTexts.some((text) => text.trim().length > 0);
}
//#endregion
export { inferToolMetaFromArgs as a, createCodexAppServerToolResultExtensionRunner as c, runAgentHarnessBeforeCompactionHook as d, formatToolProgressOutput as i, resolveAgentHarnessBeforePromptBuildResult as l, classifyAgentHarnessTerminalOutcome as n, loadCodexBundleMcpThreadConfig as o, detectAndLoadAgentHarnessPromptImages as r, queueAgentHarnessMessage as s, TOOL_PROGRESS_OUTPUT_MAX_CHARS as t, runAgentHarnessAfterCompactionHook as u };
