import { i as OpenClawConfig } from "./types.openclaw-DBHlrrVj.js";
import { n as GetReplyOptions, s as ReplyPayload } from "./types-M6XXnA3B.js";
import { $r as CommandSessionMetadataChange, Jr as ReplyDispatcherWithTypingOptions, Qr as GetReplyFromConfig, Zr as DispatchFromConfigResult, qr as ReplyDispatcherOptions } from "./types-C0dQmare.js";
import { n as MsgContext, t as FinalizedMsgContext } from "./templating-DE3RVG5z.js";
import { cn as ReplyDispatcher } from "./hook-types-Ciec6sPw.js";
//#region src/auto-reply/dispatch.d.ts
type DispatchInboundResult = DispatchFromConfigResult;
/** Dispatches one finalized inbound message through reply resolution and queued delivery. */
declare function dispatchInboundMessage(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  toolsAllow?: string[];
  replyOptions?: Omit<GetReplyOptions, "onBlockReply">;
  replyResolver?: GetReplyFromConfig;
  onSessionMetadataChanges?: (changes: CommandSessionMetadataChange[]) => void;
}): Promise<DispatchInboundResult>;
/** Creates a buffered dispatcher with typing, hooks, and stale foreground delivery suppression. */
declare function dispatchInboundMessageWithBufferedDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  toolsAllow?: string[];
  replyOptions?: Omit<GetReplyOptions, "onBlockReply">;
  replyResolver?: GetReplyFromConfig;
  onSessionMetadataChanges?: (changes: CommandSessionMetadataChange[]) => void;
}): Promise<DispatchInboundResult>;
/** Creates a plain dispatcher, installs global send hooks, and dispatches the inbound message. */
declare function dispatchInboundMessageWithDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  toolsAllow?: string[];
  replyOptions?: Omit<GetReplyOptions, "onBlockReply">;
  replyResolver?: GetReplyFromConfig;
}): Promise<DispatchInboundResult>;
//#endregion
//#region src/auto-reply/heartbeat-reply-payload.d.ts
/** Pick the last outbound-capable reply payload for heartbeat delivery. */
declare function resolveHeartbeatReplyPayload(replyResult: ReplyPayload | ReplyPayload[] | undefined): ReplyPayload | undefined;
//#endregion
export { dispatchInboundMessageWithDispatcher as i, dispatchInboundMessage as n, dispatchInboundMessageWithBufferedDispatcher as r, resolveHeartbeatReplyPayload as t };