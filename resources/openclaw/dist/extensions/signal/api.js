import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-ms-4J9iY.js";
import { a as normalizeSignalAllowRecipient, c as resolveSignalSender, d as normalizeSignalMessagingTarget, i as isSignalSenderAllowed, l as looksLikeUuid, n as formatSignalSenderDisplay, o as resolveSignalPeerId, r as formatSignalSenderId, s as resolveSignalRecipient, t as formatSignalPairingIdLine, u as looksLikeSignalTargetId } from "../../identity-IGz-X4Li.js";
import { n as markdownToSignalTextChunks, t as markdownToSignalText } from "../../format-B-0MMYcV.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-CgOWS03A.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-DetJujbK.js";
import { i as resolveSignalOutboundTarget, n as createSignalPluginBase, r as signalSetupWizard, t as signalPlugin } from "../../channel-BEL8ozXJ.js";
import { r as normalizeSignalAccountInput, s as signalSetupAdapter } from "../../setup-core-DU4Kigam.js";
import { a as looksLikeArchive, n as extractSignalCliArchive, o as pickAsset, r as installSignalCli } from "../../install-signal-cli-DupRoN7P.js";
import { t as monitorSignalProvider } from "../../monitor-DLQu0UP3.js";
import { n as sendReadReceiptSignal, r as sendTypingSignal, t as sendMessageSignal } from "../../send-hICEM6a-.js";
import { t as probeSignal } from "../../probe-BssMpiGO.js";
//#region extensions/signal/src/channel.setup.ts
const signalSetupPlugin = { ...createSignalPluginBase({
	setupWizard: signalSetupWizard,
	setup: signalSetupAdapter
}) };
//#endregion
export { extractSignalCliArchive, formatSignalPairingIdLine, formatSignalSenderDisplay, formatSignalSenderId, installSignalCli, isSignalSenderAllowed, listEnabledSignalAccounts, listSignalAccountIds, looksLikeArchive, looksLikeSignalTargetId, looksLikeUuid, markdownToSignalText, markdownToSignalTextChunks, monitorSignalProvider, normalizeSignalAccountInput, normalizeSignalAllowRecipient, normalizeSignalMessagingTarget, pickAsset, probeSignal, removeReactionSignal, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalOutboundTarget, resolveSignalPeerId, resolveSignalReactionLevel, resolveSignalRecipient, resolveSignalSender, sendMessageSignal, sendReactionSignal, sendReadReceiptSignal, sendTypingSignal, signalMessageActions, signalPlugin, signalSetupPlugin };
