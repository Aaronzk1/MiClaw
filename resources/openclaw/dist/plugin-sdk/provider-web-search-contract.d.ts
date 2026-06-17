import { Gs as WebSearchProviderPlugin, Hs as WebSearchCredentialResolutionSource, Js as WebSearchProviderToolExecutionContext, Ks as WebSearchProviderSetupContext, qs as WebSearchProviderToolDefinition } from "./types-BVAOMoZy.js";
import { t as enablePluginInConfig } from "./provider-enable-config-Boz7XZ64.js";
import { a as setProviderWebSearchPluginConfigValue, i as resolveProviderWebSearchPluginConfig, n as getTopLevelCredentialValue, o as setScopedCredentialValue, r as mergeScopedSearchConfig, s as setTopLevelCredentialValue, t as getScopedCredentialValue } from "./web-search-provider-config-8q-9jO8s.js";
import { i as WebSearchProviderContractFields, n as WebSearchProviderConfiguredCredential, r as WebSearchProviderContractCredential, t as CreateWebSearchProviderContractFieldsOptions } from "./provider-web-search-contract-fields-9nvaU2Fy.js";

//#region src/plugin-sdk/provider-web-search-contract.d.ts
type CreateWebSearchProviderSelectionOptions = CreateWebSearchProviderContractFieldsOptions & {
  /** Plugin id to enable when this provider is selected through setup/configuration flows. */selectionPluginId?: string;
};
/** Build the public web-search provider hooks, including optional selection-time plugin enabling. */
declare function createWebSearchProviderContractFields(options: CreateWebSearchProviderSelectionOptions): Pick<WebSearchProviderPlugin, "inactiveSecretPaths" | "getCredentialValue" | "setCredentialValue"> & Partial<Pick<WebSearchProviderPlugin, "applySelectionConfig" | "getConfiguredCredentialValue" | "setConfiguredCredentialValue">>;
//#endregion
export { type CreateWebSearchProviderContractFieldsOptions, type WebSearchCredentialResolutionSource, type WebSearchProviderConfiguredCredential, type WebSearchProviderContractCredential, type WebSearchProviderContractFields, type WebSearchProviderPlugin, type WebSearchProviderSetupContext, type WebSearchProviderToolDefinition, type WebSearchProviderToolExecutionContext, createWebSearchProviderContractFields, enablePluginInConfig, getScopedCredentialValue, getTopLevelCredentialValue, mergeScopedSearchConfig, resolveProviderWebSearchPluginConfig, setProviderWebSearchPluginConfigValue, setScopedCredentialValue, setTopLevelCredentialValue };