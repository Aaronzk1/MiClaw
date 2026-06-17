import { Bc as EmbeddedAgentRunResult, oc as RunEmbeddedAgentParams } from "./types-C0dQmare.js";
//#region src/agents/embedded-agent-runner/run.d.ts
declare function runEmbeddedAgent(paramsInput: RunEmbeddedAgentParams): Promise<EmbeddedAgentRunResult>;
//#endregion
export { runEmbeddedAgent as t };