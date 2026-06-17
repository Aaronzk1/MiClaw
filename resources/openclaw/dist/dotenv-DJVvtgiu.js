import { y as resolveStateDir } from "./paths-mvMm5bYV.js";
import { t as loadGlobalRuntimeDotEnvFiles } from "./dotenv-global-I5G89OLc.js";
import { n as loadWorkspaceDotEnvFile } from "./dotenv-BjGiDMA4.js";
import path from "node:path";
//#region src/cli/dotenv.ts
/** Load `.env` files for normal CLI commands without overriding existing process env. */
function loadCliDotEnv(opts) {
	const quiet = opts?.quiet ?? true;
	loadWorkspaceDotEnvFile(path.join(process.cwd(), ".env"), { quiet });
	loadGlobalRuntimeDotEnvFiles({
		quiet,
		stateEnvPath: path.join(resolveStateDir(process.env), ".env")
	});
}
//#endregion
export { loadCliDotEnv };
