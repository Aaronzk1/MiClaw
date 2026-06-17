import "./session-binding-service-cfUL2BWM.js";
import "./thread-bindings-policy-DZGWBoLX.js";
import "./channel-access-compat-D8U8oQUf.js";
import "./conversation-binding-F1u3otwq.js";
import "./binding-registry-DEX4J6tW.js";
import "./session-Do0yFgU8.js";
import "./pairing-store-CxANz_ON.js";
import "./binding-targets-DscQX_tF.js";
import "./binding-routing-C-pxzG2P.js";
import "./pairing-labels-BrpGMnBC.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime.js");
	return inboundSessionRuntimePromise;
}
/**
* Best-effort inbound session metadata recorder for channel plugin command handlers.
*/
async function recordInboundSessionMetaSafe(params) {
	const runtime = await loadInboundSessionRuntime();
	const storePath = runtime.resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
	try {
		await runtime.recordSessionMetaFromInbound({
			storePath,
			sessionKey: params.sessionKey,
			ctx: params.ctx
		});
	} catch (err) {
		params.onError?.(err);
	}
}
//#endregion
export { recordInboundSessionMetaSafe as t };
