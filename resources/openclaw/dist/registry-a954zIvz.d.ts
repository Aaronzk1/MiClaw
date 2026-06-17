import { M as OpenClawPluginGatewayRuntimeScopeSurface } from "./types-C0dQmare.js";
import { t as PluginHttpRouteRegistration$1 } from "./registry-types-CpZPQPZg.js";
//#region src/plugins/registry.d.ts
type PluginHttpRouteRegistration = PluginHttpRouteRegistration$1 & {
  gatewayRuntimeScopeSurface?: OpenClawPluginGatewayRuntimeScopeSurface;
};
//#endregion
export { PluginHttpRouteRegistration as t };