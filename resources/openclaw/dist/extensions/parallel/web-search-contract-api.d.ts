import { Js as WebSearchProviderPlugin } from "../../types-C0dQmare.js";
//#region extensions/parallel/web-search-contract-api.d.ts
declare function createParallelWebSearchProvider(): WebSearchProviderPlugin;
declare function createParallelFreeWebSearchProvider(): WebSearchProviderPlugin;
//#endregion
export { createParallelFreeWebSearchProvider, createParallelWebSearchProvider };