import { i as OpenClawConfig } from "../../types.openclaw-DBHlrrVj.js";
import { C as ChannelDoctorConfigMutation, T as ChannelDoctorLegacyConfigRule } from "../../types.adapters-B6PMXit1.js";
//#region extensions/imessage/doctor-contract-api.d.ts
declare const legacyConfigRules: ChannelDoctorLegacyConfigRule[];
declare function normalizeCompatibilityConfig({
  cfg
}: {
  cfg: OpenClawConfig;
}): ChannelDoctorConfigMutation;
//#endregion
export { legacyConfigRules, normalizeCompatibilityConfig };