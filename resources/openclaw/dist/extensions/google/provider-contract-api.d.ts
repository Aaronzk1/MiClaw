import { cn as ProviderPlugin } from "../../types-C0dQmare.js";
//#region extensions/google/provider-contract-api.d.ts
declare function createGoogleProvider(): ProviderPlugin;
declare function createGoogleVertexProvider(): ProviderPlugin;
declare function createGoogleGeminiCliProvider(): ProviderPlugin;
//#endregion
export { createGoogleGeminiCliProvider, createGoogleProvider, createGoogleVertexProvider };