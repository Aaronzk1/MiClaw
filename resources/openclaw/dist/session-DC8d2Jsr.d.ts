import { n as MsgContext } from "./templating-DE3RVG5z.js";
import { n as GroupKeyResolution } from "./types-B4Q1rYPc.js";
import { t as InboundLastRouteUpdate } from "./session.types-BCEl-vX2.js";

//#region src/channels/session.d.ts
declare function recordInboundSession(params: {
  storePath: string;
  sessionKey: string;
  ctx: MsgContext;
  groupResolution?: GroupKeyResolution | null;
  createIfMissing?: boolean;
  updateLastRoute?: InboundLastRouteUpdate;
  onRecordError: (err: unknown) => void;
  trackSessionMetaTask?: (task: Promise<unknown>) => void;
}): Promise<void>;
//#endregion
export { recordInboundSession as t };