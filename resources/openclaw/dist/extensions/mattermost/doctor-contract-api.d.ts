import { i as OpenClawConfig } from "../../types.openclaw-DBHlrrVj.js";
import { t as LegacyConfigRule } from "../../legacy.shared-CFJyEGh7.js";
import { C as ChannelDoctorConfigMutation } from "../../types.adapters-B6PMXit1.js";
//#region extensions/mattermost/src/doctor-contract.d.ts
declare const legacyConfigRules: LegacyConfigRule[];
declare const normalizeCompatibilityConfig: (params: {
  cfg: OpenClawConfig;
}) => ChannelDoctorConfigMutation;
//#endregion
export { legacyConfigRules, normalizeCompatibilityConfig };