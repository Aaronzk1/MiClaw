import { n as MAX_TIMER_TIMEOUT_MS } from "./number-coercion-CJQ8TR--.js";
import { i as formatErrorMessage } from "./errors-BXgSefBE.js";
import { t as installProcessWarningFilter } from "./warning-filter-p3Ue6g9S.js";
import "./number-coercion-Z7n6tXLk.js";
import { createRequire } from "node:module";
//#region src/infra/node-sqlite.ts
const require = createRequire(import.meta.url);
/** Load node:sqlite after installing the process warning filter. */
function requireNodeSqlite() {
	installProcessWarningFilter();
	try {
		return require("node:sqlite");
	} catch (err) {
		const message = formatErrorMessage(err);
		throw new Error(`SQLite support is unavailable in this Node runtime (missing node:sqlite). ${message}`, { cause: err });
	}
}
function normalizeNonNegativeInteger(value, label) {
	if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
	return value;
}
/** Configure WAL pragmas and return a handle for checkpoint/close maintenance. */
function configureSqliteWalMaintenance(db, options = {}) {
	const autoCheckpointPages = normalizeNonNegativeInteger(options.autoCheckpointPages ?? 1e3, "autoCheckpointPages");
	const checkpointIntervalMs = normalizeNonNegativeInteger(options.checkpointIntervalMs ?? 18e5, "checkpointIntervalMs");
	const timerIntervalMs = Math.min(checkpointIntervalMs, MAX_TIMER_TIMEOUT_MS);
	const checkpointMode = options.checkpointMode ?? "TRUNCATE";
	db.exec("PRAGMA journal_mode = WAL;");
	db.exec(`PRAGMA wal_autocheckpoint = ${autoCheckpointPages};`);
	const checkpoint = () => {
		try {
			db.exec(`PRAGMA wal_checkpoint(${checkpointMode});`);
			return true;
		} catch (error) {
			options.onCheckpointError?.(error);
			return false;
		}
	};
	let timer = null;
	if (timerIntervalMs > 0) {
		timer = setInterval(checkpoint, timerIntervalMs);
		timer.unref?.();
	}
	return {
		checkpoint,
		close: () => {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
			return checkpoint();
		}
	};
}
//#endregion
export { requireNodeSqlite as n, configureSqliteWalMaintenance as t };
