import { t as createLazyImportLoader } from "./lazy-promise-BONnzNfb.js";
//#region src/auto-reply/reply/dispatch-acp.runtime.ts
const dispatchAcpLoader = createLazyImportLoader(() => import("./dispatch-acp-Bz2s-_MS.js"));
const dispatchAcpCommandBypassLoader = createLazyImportLoader(() => import("./dispatch-acp-command-bypass-B1tM8k1q.js"));
function loadDispatchAcp() {
	return dispatchAcpLoader.load();
}
function loadDispatchAcpCommandBypass() {
	return dispatchAcpCommandBypassLoader.load();
}
async function shouldBypassAcpDispatchForCommand(...args) {
	return (await loadDispatchAcpCommandBypass()).shouldBypassAcpDispatchForCommand(...args);
}
async function tryDispatchAcpReply(...args) {
	return await (await loadDispatchAcp()).tryDispatchAcpReply(...args);
}
//#endregion
export { shouldBypassAcpDispatchForCommand, tryDispatchAcpReply };
