import "./agent-scope-MrLta7Pq.js";
import { a as resolveAgentDir, o as resolveAgentWorkspaceDir } from "./agent-scope-config-CgCYpZfK.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-mDjiWzE5.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-NEwU8m3X.js";
import { t as loadSessionStore } from "./store-load-C4uq6Lrq.js";
import { d as updateSessionStore, f as updateSessionStoreEntry, l as saveSessionStore } from "./store-Qsgtu-0y.js";
import "./sessions-D6zZvoxX.js";
import { t as resolveThinkingDefault } from "./model-thinking-default-dIc9T64G.js";
import "./model-selection-CA_65iXi.js";
import { d as ensureAgentWorkspace } from "./workspace-B0bmoo98.js";
import { t as resolveAgentTimeoutMs } from "./timeout-Drw0_zOv.js";
import { n as resolveAgentIdentity } from "./identity-Qcvvo6SY.js";
import { t as runEmbeddedAgent } from "./embedded-agent-L9tQiaO-.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("openclaw/extension-api is deprecated. Migrate to api.runtime.agent.* or focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration", {
	code: "OPENCLAW_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedAgent, runEmbeddedAgent as runEmbeddedPiAgent, saveSessionStore, updateSessionStore, updateSessionStoreEntry };
