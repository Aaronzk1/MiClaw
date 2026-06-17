import { i as OpenClawConfig } from "./types.openclaw-DBHlrrVj.js";
import { t as AccountScopedConversationBindingManager } from "./thread-bindings-runtime-DDW3XAnR.js";

//#region extensions/imessage/src/conversation-bindings.d.ts
type IMessageBindingTargetKind = "subagent" | "acp";
type IMessageConversationBindingManager = AccountScopedConversationBindingManager<IMessageBindingTargetKind>;
declare function createIMessageConversationBindingManager(params: {
  accountId?: string;
  cfg: OpenClawConfig;
}): IMessageConversationBindingManager;
declare const testing: {
  resetIMessageConversationBindingsForTests(): void;
};
//#endregion
export { testing as n, createIMessageConversationBindingManager as t };