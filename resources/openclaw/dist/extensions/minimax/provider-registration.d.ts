import { cn as ProviderPlugin } from "../../types-C0dQmare.js";
import { g as OpenClawPluginApi } from "../../plugin-entry-BOAJmgcf.js";
//#region extensions/minimax/provider-registration.d.ts
declare function buildMinimaxApiProviderPlugin(): ProviderPlugin;
declare function buildMinimaxPortalProviderPlugin(): ProviderPlugin;
declare function registerMinimaxProviders(api: OpenClawPluginApi): void;
//#endregion
export { buildMinimaxApiProviderPlugin, buildMinimaxPortalProviderPlugin, registerMinimaxProviders };