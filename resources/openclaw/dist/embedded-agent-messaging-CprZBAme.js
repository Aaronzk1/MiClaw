import { c as normalizeOptionalString } from "./string-coerce-mnp54Vah.js";
import { a as normalizeChannelId, t as getChannelPlugin } from "./registry-MkxNn1Ue.js";
import "./plugins-t2ejWcVy.js";
//#region src/agents/embedded-agent-messaging.ts
/**
* Identifies messaging tools and send actions during embedded-agent runs.
*/
const CORE_MESSAGING_TOOLS = new Set(["sessions_send", "message"]);
const MESSAGE_TOOL_SEND_ACTIONS = new Set([
	"send",
	"thread-reply",
	"sendWithEffect",
	"sendAttachment",
	"upload-file"
]);
/** Return true when a message action sends or uploads user-visible content. */
function isMessageToolSendActionName(action) {
	const normalized = normalizeOptionalString(action) ?? "";
	return MESSAGE_TOOL_SEND_ACTIONS.has(normalized);
}
/** Return true for core or channel-plugin messaging tool names. */
function isMessagingTool(toolName) {
	if (CORE_MESSAGING_TOOLS.has(toolName)) return true;
	const providerId = normalizeChannelId(toolName);
	return Boolean(providerId && getChannelPlugin(providerId)?.actions);
}
/** Return true when the specific tool invocation is an outbound send. */
function isMessagingToolSendAction(toolName, args) {
	const action = normalizeOptionalString(args.action) ?? "";
	if (toolName === "sessions_send") return true;
	if (toolName === "message") return isMessageToolSendActionName(action);
	const providerId = normalizeChannelId(toolName);
	if (!providerId) return false;
	const plugin = getChannelPlugin(providerId);
	if (!plugin?.actions?.extractToolSend) return false;
	return Boolean(plugin.actions.extractToolSend({ args })?.to);
}
//#endregion
export { isMessagingTool as n, isMessagingToolSendAction as r, isMessageToolSendActionName as t };
