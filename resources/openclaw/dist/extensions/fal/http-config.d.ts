import { i as OpenClawConfig } from "../../types.openclaw-DBHlrrVj.js";
import { h as ProviderRequestCapability } from "../../provider-request-config-Q7J3DPH_.js";
import { s as AuthProfileStore } from "../../types-Mr2-MEbO.js";
import { h as resolveProviderHttpRequestConfig } from "../../provider-http-D3zLmyzn.js";
//#region extensions/fal/http-config.d.ts
type FalAuthenticatedRequest = {
  cfg?: OpenClawConfig;
  agentDir?: string;
  authStore?: AuthProfileStore;
};
declare function resolveFalHttpRequestConfig(params: {
  req: FalAuthenticatedRequest;
  baseUrl?: string;
  capability: ProviderRequestCapability;
}): Promise<ReturnType<typeof resolveProviderHttpRequestConfig>>;
//#endregion
export { resolveFalHttpRequestConfig };