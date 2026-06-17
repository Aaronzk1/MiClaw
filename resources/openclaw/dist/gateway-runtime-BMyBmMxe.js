import "./net-DTe7AQiu.js";
import "./auth-DXSWhsnk.js";
import "./client-C2g2lFC5.js";
import "./src-oj0IwW6K.js";
import "./operator-approvals-client-4O2dZK2Q.js";
import "./gateway-rpc-DV2_JEP0.js";
import "./hosted-plugin-surface-url-Dco7NxxG.js";
import "./plugin-node-capability-CQtFV9Fn.js";
import "./node-command-policy-DYPdfWjH.js";
import "./nodes.helpers-DeAuiiQp.js";
import "./startup-auth-BtAuEBV-.js";
//#region src/gateway/channel-status-patches.ts
/** Creates a connected-channel status patch with matching connection/event timestamps. */
function createConnectedChannelStatusPatch(at = Date.now()) {
	return {
		connected: true,
		lastConnectedAt: at,
		lastEventAt: at
	};
}
/** Creates a transport-activity patch for health/activity monitors. */
function createTransportActivityStatusPatch(at = Date.now()) {
	return { lastTransportActivityAt: at };
}
//#endregion
export { createTransportActivityStatusPatch as n, createConnectedChannelStatusPatch as t };
