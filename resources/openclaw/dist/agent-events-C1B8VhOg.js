import { n as resolveGlobalSingleton } from "./global-singleton-PwlQSEal.js";
import { n as registerListener, t as notifyListeners } from "./listeners-BogSNJ-R.js";
//#region src/infra/agent-events.ts
const AGENT_EVENT_STATE_KEY = Symbol.for("openclaw.agentEvents.state");
function getAgentEventState() {
	return resolveGlobalSingleton(AGENT_EVENT_STATE_KEY, () => ({
		seqByRun: /* @__PURE__ */ new Map(),
		listeners: /* @__PURE__ */ new Set(),
		runContextById: /* @__PURE__ */ new Map()
	}));
}
/** Registers or merges per-run context used by later agent event emissions. */
function registerAgentRunContext(runId, context) {
	if (!runId) return;
	const state = getAgentEventState();
	const existing = state.runContextById.get(runId);
	if (!existing) {
		state.runContextById.set(runId, {
			...context,
			registeredAt: context.registeredAt ?? Date.now()
		});
		return;
	}
	if (context.sessionKey && existing.sessionKey !== context.sessionKey) existing.sessionKey = context.sessionKey;
	if (context.sessionId && existing.sessionId !== context.sessionId) existing.sessionId = context.sessionId;
	if (context.verboseLevel && existing.verboseLevel !== context.verboseLevel) existing.verboseLevel = context.verboseLevel;
	if (context.isControlUiVisible !== void 0) existing.isControlUiVisible = context.isControlUiVisible;
	if (context.isHeartbeat !== void 0 && existing.isHeartbeat !== context.isHeartbeat) existing.isHeartbeat = context.isHeartbeat;
	if (context.registeredAt !== void 0) existing.registeredAt = context.registeredAt;
	if (context.lastActiveAt !== void 0) existing.lastActiveAt = context.lastActiveAt;
}
/** Returns the currently registered context for a run, if it has not been cleared or swept. */
function getAgentRunContext(runId) {
	return getAgentEventState().runContextById.get(runId);
}
/** Clears context and sequence state for a run that has ended or been discarded. */
function clearAgentRunContext(runId) {
	const state = getAgentEventState();
	state.runContextById.delete(runId);
	state.seqByRun.delete(runId);
}
/**
* Sweep stale run contexts that exceeded the given TTL.
* Guards against orphaned entries when lifecycle "end"/"error" events are missed.
*/
function sweepStaleRunContexts(maxAgeMs = 1800 * 1e3) {
	const state = getAgentEventState();
	const now = Date.now();
	let swept = 0;
	for (const [runId, ctx] of state.runContextById.entries()) {
		const lastSeen = ctx.lastActiveAt ?? ctx.registeredAt;
		if ((lastSeen ? now - lastSeen : Infinity) > maxAgeMs) {
			state.runContextById.delete(runId);
			state.seqByRun.delete(runId);
			swept++;
		}
	}
	return swept;
}
/** Emits an agent event after assigning per-run sequence, timestamp, and context metadata. */
function emitAgentEvent(event) {
	const state = getAgentEventState();
	const nextSeq = (state.seqByRun.get(event.runId) ?? 0) + 1;
	state.seqByRun.set(event.runId, nextSeq);
	const context = state.runContextById.get(event.runId);
	if (context) context.lastActiveAt = Date.now();
	const isControlUiVisible = context?.isControlUiVisible ?? true;
	const eventSessionKey = typeof event.sessionKey === "string" && event.sessionKey.trim() ? event.sessionKey : void 0;
	const sessionKey = isControlUiVisible || event.stream === "lifecycle" ? eventSessionKey ?? context?.sessionKey : void 0;
	const sessionId = event.stream === "lifecycle" ? event.sessionId ?? context?.sessionId : event.sessionId;
	const enriched = {
		...event,
		sessionKey,
		...sessionId ? { sessionId } : {},
		seq: nextSeq,
		ts: Date.now()
	};
	notifyListeners(state.listeners, enriched);
}
/** Emits an item activity event on the shared agent event bus. */
function emitAgentItemEvent(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "item",
		data: params.data,
		...params.sessionKey ? { sessionKey: params.sessionKey } : {}
	});
}
/** Emits a plan update event on the shared agent event bus. */
function emitAgentPlanEvent(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "plan",
		data: params.data,
		...params.sessionKey ? { sessionKey: params.sessionKey } : {}
	});
}
/** Emits an approval event on the shared agent event bus. */
function emitAgentApprovalEvent(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "approval",
		data: params.data,
		...params.sessionKey ? { sessionKey: params.sessionKey } : {}
	});
}
/** Emits command output for a running or completed item/tool call. */
function emitAgentCommandOutputEvent(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "command_output",
		data: params.data,
		...params.sessionKey ? { sessionKey: params.sessionKey } : {}
	});
}
/** Emits a patch summary for a completed file-editing item/tool call. */
function emitAgentPatchSummaryEvent(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: "patch",
		data: params.data,
		...params.sessionKey ? { sessionKey: params.sessionKey } : {}
	});
}
/** Subscribes to sequenced agent events; returns an unsubscribe callback. */
function onAgentEvent(listener) {
	return registerListener(getAgentEventState().listeners, listener);
}
/** Clears all agent event state, including listeners; test-only helper. */
function resetAgentEventsForTest() {
	const state = getAgentEventState();
	state.seqByRun.clear();
	state.listeners.clear();
	state.runContextById.clear();
}
//#endregion
export { emitAgentItemEvent as a, getAgentRunContext as c, resetAgentEventsForTest as d, sweepStaleRunContexts as f, emitAgentEvent as i, onAgentEvent as l, emitAgentApprovalEvent as n, emitAgentPatchSummaryEvent as o, emitAgentCommandOutputEvent as r, emitAgentPlanEvent as s, clearAgentRunContext as t, registerAgentRunContext as u };
