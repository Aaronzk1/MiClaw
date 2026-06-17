import "./safe-text-BkQYdJi1.js";
import { t as chunkTextByBreakResolver } from "./text-chunking-DcQY-Iem.js";
import "./tables-BgtXxld3.js";
import "./chunk-items-HPRB2OIa.js";
import "./auto-linked-file-ref-t_9l4Xzl.js";
//#region src/plugin-sdk/text-chunking.ts
/**
* Splits outbound channel text into chunks no longer than the requested limit.
* Newline boundaries win over spaces; text without usable separators falls back
* to a hard character split so channel senders always receive bounded strings.
*/
function chunkTextForOutbound(text, limit) {
	return chunkTextByBreakResolver(text, limit, (window) => {
		const lastNewline = window.lastIndexOf("\n");
		const lastSpace = window.lastIndexOf(" ");
		return lastNewline > 0 ? lastNewline : lastSpace;
	});
}
//#endregion
export { chunkTextForOutbound as t };
