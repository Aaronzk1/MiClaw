import { l as onAgentEvent, t as clearAgentRunContext } from "./agent-events-C1B8VhOg.js";
import { n as onSessionTranscriptUpdate } from "./transcript-events-DTn-thXR.js";
import { n as onSessionLifecycleEvent } from "./session-lifecycle-events-Ch4Mykew.js";
import { r as onHeartbeatEvent } from "./heartbeat-events-DlT3VAUF.js";
//#region src/gateway/server-runtime-subscriptions.ts
/** Register gateway runtime event subscriptions and return unsubscribe handles. */
function startGatewayEventSubscriptions(params) {
	let agentEventHandlerPromise = null;
	const getAgentEventHandler = () => {
		agentEventHandlerPromise ??= Promise.all([import("./server-chat-Cg0ZQdIb.js"), import("./server-session-key-BAgOp1Xj.js")]).then(([{ createAgentEventHandler }, { resolveSessionKeyForRun }]) => createAgentEventHandler({
			broadcast: params.broadcast,
			broadcastToConnIds: params.broadcastToConnIds,
			nodeSendToSession: params.nodeSendToSession,
			agentRunSeq: params.agentRunSeq,
			chatRunState: params.chatRunState,
			resolveSessionKeyForRun,
			clearAgentRunContext,
			toolEventRecipients: params.toolEventRecipients,
			sessionEventSubscribers: params.sessionEventSubscribers,
			sessionMessageSubscribers: params.sessionMessageSubscribers,
			clearTrackedActiveRun: ({ runId, clientRunId }) => {
				const candidateRunIds = runId === clientRunId ? [runId] : [runId, clientRunId];
				for (const candidateRunId of candidateRunIds) {
					const entry = params.chatAbortControllers.get(candidateRunId);
					if (entry) entry.projectSessionActive = false;
				}
			},
			isChatSendRunActive: (runId) => {
				const entry = params.chatAbortControllers.get(runId);
				return entry !== void 0 && entry.kind !== "agent";
			}
		}));
		return agentEventHandlerPromise;
	};
	let sessionEventsModulePromise = null;
	const getSessionEventsModule = () => {
		sessionEventsModulePromise ??= import("./server-session-events-DNbtGHY_.js");
		return sessionEventsModulePromise;
	};
	let transcriptUpdateHandlerPromise = null;
	const getTranscriptUpdateHandler = () => {
		transcriptUpdateHandlerPromise ??= getSessionEventsModule().then(({ createTranscriptUpdateBroadcastHandler }) => createTranscriptUpdateBroadcastHandler({
			broadcastToConnIds: params.broadcastToConnIds,
			sessionEventSubscribers: params.sessionEventSubscribers,
			sessionMessageSubscribers: params.sessionMessageSubscribers
		}));
		return transcriptUpdateHandlerPromise;
	};
	let lifecycleEventHandlerPromise = null;
	const getLifecycleEventHandler = () => {
		lifecycleEventHandlerPromise ??= getSessionEventsModule().then(({ createLifecycleEventBroadcastHandler }) => createLifecycleEventBroadcastHandler({
			broadcastToConnIds: params.broadcastToConnIds,
			sessionEventSubscribers: params.sessionEventSubscribers
		}));
		return lifecycleEventHandlerPromise;
	};
	return {
		agentUnsub: onAgentEvent((evt) => {
			getAgentEventHandler().then((handler) => handler(evt));
		}),
		heartbeatUnsub: onHeartbeatEvent((evt) => {
			params.broadcast("heartbeat", evt, { dropIfSlow: true });
		}),
		transcriptUnsub: onSessionTranscriptUpdate((evt) => {
			getTranscriptUpdateHandler().then((handler) => handler(evt));
		}),
		lifecycleUnsub: onSessionLifecycleEvent((evt) => {
			getLifecycleEventHandler().then((handler) => handler(evt));
		})
	};
}
//#endregion
export { startGatewayEventSubscriptions };
