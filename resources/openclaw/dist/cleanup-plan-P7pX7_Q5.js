import { _ as resolveOAuthDir, s as resolveConfigPath, y as resolveStateDir } from "./paths-mvMm5bYV.js";
import { i as getRuntimeConfig } from "./io-Gi7-pyU-.js";
import "./config-C9RxTsn1.js";
import { t as buildCleanupPlan } from "./cleanup-utils-CER_zAek.js";
//#region src/commands/cleanup-plan.ts
/** Build the cleanup plan for the current runtime config/state/credential paths on disk. */
function resolveCleanupPlanFromDisk() {
	const cfg = getRuntimeConfig();
	const stateDir = resolveStateDir();
	const configPath = resolveConfigPath();
	const oauthDir = resolveOAuthDir();
	return {
		cfg,
		stateDir,
		configPath,
		oauthDir,
		...buildCleanupPlan({
			cfg,
			stateDir,
			configPath,
			oauthDir
		})
	};
}
//#endregion
export { resolveCleanupPlanFromDisk as t };
