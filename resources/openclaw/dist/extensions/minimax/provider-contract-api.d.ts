import { cn as ProviderPlugin } from "../../types-C0dQmare.js";
//#region extensions/minimax/provider-contract-api.d.ts
declare function createMinimaxProvider(): ProviderPlugin;
declare function createMinimaxPortalProvider(): ProviderPlugin;
//#endregion
export { createMinimaxPortalProvider, createMinimaxProvider };