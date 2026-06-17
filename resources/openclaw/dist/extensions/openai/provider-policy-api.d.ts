import { f as ModelProviderConfig } from "../../types.models-O5iWV16x.js";
import { Oc as ProviderThinkingProfile } from "../../types-C0dQmare.js";
//#region extensions/openai/provider-policy-api.d.ts
declare function normalizeConfig(params: {
  provider: string;
  providerConfig: ModelProviderConfig;
}): ModelProviderConfig;
declare function resolveThinkingProfile(params: {
  provider: string;
  modelId: string;
}): ProviderThinkingProfile | null;
//#endregion
export { normalizeConfig, resolveThinkingProfile };