import { kc as ProviderRuntimeModel } from "../../types-C0dQmare.js";
import { Kt as ProviderResolveDynamicModelContext } from "../../plugin-entry-BOAJmgcf.js";

//#region extensions/google/provider-models.d.ts
declare function resolveGoogleGeminiForwardCompatModel(params: {
  providerId: string;
  templateProviderId?: string;
  ctx: ProviderResolveDynamicModelContext;
}): ProviderRuntimeModel | undefined;
declare function isModernGoogleModel(modelId: string): boolean;
//#endregion
export { isModernGoogleModel, resolveGoogleGeminiForwardCompatModel };