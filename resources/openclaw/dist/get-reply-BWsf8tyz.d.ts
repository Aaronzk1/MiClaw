import { i as OpenClawConfig } from "./types.openclaw-DBHlrrVj.js";
import { n as GetReplyOptions, s as ReplyPayload } from "./types-M6XXnA3B.js";
import { n as MsgContext } from "./templating-DE3RVG5z.js";

//#region src/auto-reply/reply/get-reply.d.ts
declare function getReplyFromConfig(ctx: MsgContext, opts?: GetReplyOptions, configOverride?: OpenClawConfig): Promise<ReplyPayload | ReplyPayload[] | undefined>;
//#endregion
export { getReplyFromConfig as t };