import { t as BaseProbeResult } from "./types.core-CyK4WLl_.js";
import { t as ChannelPlugin } from "./types.plugin-BIHyhl5u.js";
import { n as ZcaUserInfo, t as ResolvedZalouserAccount } from "./accounts-DZLwPqsN.js";
//#region extensions/zalouser/src/probe.d.ts
type ZalouserProbeResult = BaseProbeResult<string> & {
  user?: ZcaUserInfo;
};
//#endregion
//#region extensions/zalouser/src/channel.d.ts
declare const zalouserPlugin: ChannelPlugin<ResolvedZalouserAccount, ZalouserProbeResult>;
//#endregion
export { zalouserPlugin as t };