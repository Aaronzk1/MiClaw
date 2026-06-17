import { r as CommandTurnContext } from "./templating-BPhbA1Jb.js";
import { v as resolveChunkMode } from "./outbound.types-BEZiz165.js";
import { Gr as DispatchReplyWithBufferedBlockDispatcher, Kr as DispatchReplyWithDispatcher, Ur as finalizeInboundContext } from "./types-BVAOMoZy.js";
import { r as ReplyPayload } from "./reply-payload-Bq7pkpFj.js";
import { n as generateConversationLabel } from "./conversation-label-generator-BQ7rkj24.js";

//#region src/plugin-sdk/reply-dispatch-runtime.d.ts
/** Dispatches a reply with buffered block support after lazy-loading the runtime dispatcher. */
declare const dispatchReplyWithBufferedBlockDispatcher: DispatchReplyWithBufferedBlockDispatcher;
/** Dispatches a reply through the provider dispatcher after lazy-loading runtime code. */
declare const dispatchReplyWithDispatcher: DispatchReplyWithDispatcher;
//#endregion
export { type CommandTurnContext, type DispatchReplyWithBufferedBlockDispatcher, type DispatchReplyWithDispatcher, type ReplyPayload, dispatchReplyWithBufferedBlockDispatcher, dispatchReplyWithDispatcher, finalizeInboundContext, generateConversationLabel, resolveChunkMode };