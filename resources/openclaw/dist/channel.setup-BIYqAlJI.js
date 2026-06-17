import { n as zalouserSetupAdapter } from "./setup-core-kty7gX4X.js";
import { t as createZalouserPluginBase } from "./shared-Bc_78ryu.js";
import { t as zalouserSetupWizard } from "./setup-surface-OF7ojirC.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
