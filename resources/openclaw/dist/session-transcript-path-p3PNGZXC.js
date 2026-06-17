import { c as normalizeOptionalString } from "./string-coerce-mnp54Vah.js";
import fs from "node:fs";
import path from "node:path";
//#region src/gateway/session-transcript-path.ts
/** Resolve a transcript file path into a stable comparison key. */
function resolveTranscriptPathForComparison(value) {
	const trimmed = normalizeOptionalString(value);
	if (!trimmed) return;
	const resolved = path.resolve(trimmed);
	try {
		return fs.realpathSync(resolved);
	} catch {
		return resolved;
	}
}
//#endregion
export { resolveTranscriptPathForComparison as t };
