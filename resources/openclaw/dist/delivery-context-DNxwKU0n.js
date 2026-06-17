import { c as normalizeOptionalString } from "./string-coerce-mnp54Vah.js";
import "./delivery-context.shared-CpAdEETO.js";
import { i as normalizeMessageChannel } from "./message-channel-normalize-BLLf0ubu.js";
import "./message-channel-BiOeMu0l.js";
//#region src/utils/conversation-target.ts
function normalizeConversationId(value) {
	return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : typeof value === "string" ? normalizeOptionalString(value) : void 0;
}
function normalizeConversationTargetParams(params) {
	return {
		channel: typeof params.channel === "string" ? normalizeMessageChannel(params.channel) ?? params.channel.trim() : void 0,
		conversationId: normalizeConversationId(params.conversationId),
		parentConversationId: normalizeConversationId(params.parentConversationId)
	};
}
//#endregion
export { normalizeConversationTargetParams as t };
