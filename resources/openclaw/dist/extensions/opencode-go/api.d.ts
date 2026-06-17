import { i as OpenClawConfig } from "../../types.openclaw-DBHlrrVj.js";
import { n as applyOpencodeGoConfig, r as applyOpencodeGoProviderConfig, t as OPENCODE_GO_DEFAULT_MODEL_REF } from "../../onboard-_12_tK2f.js";

//#region extensions/opencode-go/api.d.ts
declare function applyOpencodeGoModelDefault(cfg: OpenClawConfig): {
  next: OpenClawConfig;
  changed: boolean;
};
//#endregion
export { OPENCODE_GO_DEFAULT_MODEL_REF, applyOpencodeGoConfig, applyOpencodeGoModelDefault, applyOpencodeGoProviderConfig };