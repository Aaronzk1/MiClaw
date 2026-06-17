import { r as logVerbose } from "./globals-GTrXU4s9.js";
import { t as buildStatusText } from "./status-text-B8Mjm64n.js";
//#region src/auto-reply/reply/commands-status.ts
/** Builds /status replies using the command's authorized channel context. */
/** Builds a status reply or suppresses unauthorized status requests. */
async function buildStatusReply(params) {
	const { command } = params;
	if (!command.isAuthorizedSender) {
		logVerbose(`Ignoring /status from unauthorized sender: ${command.senderId || "<unknown>"}`);
		return;
	}
	return { text: await buildStatusText({
		...params,
		statusChannel: command.channel
	}) };
}
//#endregion
export { buildStatusReply as t };
