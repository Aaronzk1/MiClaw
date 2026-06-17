import { t as BaseProbeResult } from "./types.core-CyK4WLl_.js";
import { t as ChannelPlugin } from "./types.plugin-BIHyhl5u.js";
import { t as ResolvedMatrixAccount } from "./accounts-BMHOiBB1.js";
//#region extensions/matrix/src/matrix/probe.d.ts
type MatrixProbe = BaseProbeResult & {
  status?: number | null;
  elapsedMs: number;
  userId?: string | null;
};
//#endregion
//#region extensions/matrix/src/channel.d.ts
declare const matrixPlugin: ChannelPlugin<ResolvedMatrixAccount, MatrixProbe>;
//#endregion
export { matrixPlugin as t };