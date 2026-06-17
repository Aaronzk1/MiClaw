import { r as LoadInstalledPluginIndexParams, t as InstalledPluginIndex } from "./installed-plugin-index-types-b33UJBZg.js";
import { n as InstalledPluginIndexStoreOptions } from "./installed-plugin-index-store-BVburNCX.js";

//#region src/plugins/plugin-registry-snapshot.d.ts
type PluginRegistrySnapshot = InstalledPluginIndex;
type LoadPluginRegistryParams = LoadInstalledPluginIndexParams & InstalledPluginIndexStoreOptions & {
  index?: PluginRegistrySnapshot;
  preferPersisted?: boolean;
};
//#endregion
export { PluginRegistrySnapshot as n, LoadPluginRegistryParams as t };