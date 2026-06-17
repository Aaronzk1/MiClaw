import { $n as PluginRuntime } from "../../types-C0dQmare.js";
//#region extensions/sms/src/runtime.d.ts
declare const setSmsRuntime: (next: PluginRuntime) => void, getSmsRuntime: () => PluginRuntime;
//#endregion
export { getSmsRuntime, setSmsRuntime };