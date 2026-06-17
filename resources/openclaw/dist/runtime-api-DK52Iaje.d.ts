import { $n as PluginRuntime } from "./types-C0dQmare.js";
//#region extensions/msteams/src/runtime.d.ts
declare const setMSTeamsRuntime: (next: PluginRuntime) => void, getMSTeamsRuntime: () => PluginRuntime, getOptionalMSTeamsRuntime: () => PluginRuntime | null;
//#endregion
export { setMSTeamsRuntime as t };