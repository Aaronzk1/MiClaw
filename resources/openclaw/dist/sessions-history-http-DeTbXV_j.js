import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-mnp54Vah.js";
import { t as createSubsystemLogger } from "./subsystem-BzXSmsuh.js";
import { i as getRuntimeConfig } from "./io-Gi7-pyU-.js";
import { n as authorizeOperatorScopesForMethod } from "./method-scopes-BtdN3y7s.js";
import { t as loadSessionStore } from "./store-load-C4uq6Lrq.js";
import "./sessions-D6zZvoxX.js";
import { n as onSessionTranscriptUpdate } from "./transcript-events-DTn-thXR.js";
import { a as readRecentSessionMessagesWithStatsAsync, d as readSessionMessagesAsync } from "./session-utils.fs-D_8-X4jl.js";
import { a as resolveSessionTranscriptCandidates } from "./session-transcript-files.fs-CM11t-8l.js";
import { g as resolveGatewaySessionStoreTarget, m as resolveFreshestSessionEntryFromStoreKeys } from "./session-utils-CHNCuY8a.js";
import { a as sendJson, i as sendInvalidRequest, l as setSseHeaders, o as sendMethodNotAllowed } from "./http-common-DunL6val.js";
import { a as getHeader, d as resolveSharedSecretHttpOperatorScopes, n as authorizeScopedGatewayHttpRequestOrReply, r as checkGatewayHttpRequestAuth } from "./http-auth-utils-Du8mRZIw.js";
import "./http-utils-leZWdpma.js";
import { t as DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS } from "./chat-display-projection-Bv2HD4Rr.js";
import { n as buildSessionHistorySnapshot, r as resolveSessionHistoryTailReadOptions, t as SessionHistorySseState } from "./session-history-state-B5plVodV.js";
import { t as resolveTranscriptPathForComparison } from "./session-transcript-path-p3PNGZXC.js";
//#region src/gateway/sessions-history-http.ts
const log = createSubsystemLogger("gateway/sessions-history-sse");
const MAX_SESSION_HISTORY_LIMIT = 1e3;
function resolveSessionHistoryPath(req) {
	const match = new URL(req.url ?? "/", "http://localhost").pathname.match(/^\/sessions\/([^/]+)\/history$/);
	if (!match) return null;
	try {
		return normalizeOptionalString(decodeURIComponent(match[1] ?? "")) ?? null;
	} catch {
		return "";
	}
}
function shouldStreamSse(req) {
	return normalizeLowercaseStringOrEmpty(getHeader(req, "accept")).includes("text/event-stream");
}
function getRequestUrl(req) {
	return new URL(req.url ?? "/", "http://localhost");
}
function resolveLimit(req) {
	const raw = getRequestUrl(req).searchParams.get("limit");
	if (raw == null || raw.trim() === "") return;
	const trimmed = raw.trim();
	const value = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
	if (!Number.isSafeInteger(value) || value < 1) return 1;
	return Math.min(MAX_SESSION_HISTORY_LIMIT, Math.max(1, value));
}
function sseWrite(res, event, payload) {
	res.write(`event: ${event}\n`);
	res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
/** Handle `/sessions/:sessionKey/history` JSON/SSE requests. */
async function handleSessionHistoryHttpRequest(req, res, opts) {
	const sessionKey = resolveSessionHistoryPath(req);
	if (sessionKey === null) return false;
	if (!sessionKey) {
		sendInvalidRequest(res, "invalid session key");
		return true;
	}
	if (req.method !== "GET") {
		sendMethodNotAllowed(res, "GET");
		return true;
	}
	const authResult = await authorizeScopedGatewayHttpRequestOrReply({
		req,
		res,
		auth: opts.auth,
		trustedProxies: opts.trustedProxies,
		allowRealIpFallback: opts.allowRealIpFallback,
		rateLimiter: opts.rateLimiter,
		operatorMethod: "chat.history",
		resolveOperatorScopes: resolveSharedSecretHttpOperatorScopes
	});
	if (!authResult) return true;
	const { cfg } = authResult;
	const target = resolveGatewaySessionStoreTarget({
		cfg,
		key: sessionKey
	});
	const entry = resolveFreshestSessionEntryFromStoreKeys(loadSessionStore(target.storePath), target.storeKeys);
	if (!entry?.sessionId) {
		sendJson(res, 404, {
			ok: false,
			error: {
				type: "not_found",
				message: `Session not found: ${sessionKey}`
			}
		});
		return true;
	}
	const limit = resolveLimit(req);
	const cursor = normalizeOptionalString(getRequestUrl(req).searchParams.get("cursor"));
	const effectiveMaxChars = DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS;
	const boundedSnapshot = cursor === void 0 && typeof limit === "number" ? await readRecentSessionMessagesWithStatsAsync(entry.sessionId, target.storePath, entry.sessionFile, resolveSessionHistoryTailReadOptions(limit)) : void 0;
	const rawSnapshot = boundedSnapshot?.messages ?? (entry?.sessionId ? await readSessionMessagesAsync(entry.sessionId, target.storePath, entry.sessionFile, {
		mode: "full",
		reason: "session history cursor pagination"
	}) : []);
	const history = buildSessionHistorySnapshot({
		rawMessages: rawSnapshot,
		maxChars: effectiveMaxChars,
		limit,
		cursor,
		rawTranscriptSeq: boundedSnapshot?.totalMessages,
		totalRawMessages: boundedSnapshot?.totalMessages
	}).history;
	if (!shouldStreamSse(req)) {
		sendJson(res, 200, {
			sessionKey: target.canonicalKey,
			...history
		});
		return true;
	}
	const transcriptCandidates = entry?.sessionId ? new Set(resolveSessionTranscriptCandidates(entry.sessionId, target.storePath, entry.sessionFile, target.agentId).map((candidate) => resolveTranscriptPathForComparison(candidate)).filter((candidate) => typeof candidate === "string")) : /* @__PURE__ */ new Set();
	let sentHistory = history;
	const sseState = SessionHistorySseState.fromRawSnapshot({
		target: {
			sessionId: entry.sessionId,
			storePath: target.storePath,
			sessionFile: entry.sessionFile
		},
		rawMessages: rawSnapshot,
		rawTranscriptSeq: boundedSnapshot?.totalMessages,
		totalRawMessages: boundedSnapshot?.totalMessages,
		maxChars: effectiveMaxChars,
		limit,
		cursor
	});
	sentHistory = sseState.snapshot();
	setSseHeaders(res);
	res.write("retry: 1000\n\n");
	sseWrite(res, "history", {
		sessionKey: target.canonicalKey,
		...sentHistory
	});
	let cleanedUp = false;
	let streamQueue = Promise.resolve();
	const cleanup = () => {
		if (cleanedUp) return;
		cleanedUp = true;
		if (heartbeat) clearInterval(heartbeat);
		if (unsubscribe) unsubscribe();
	};
	const closeStream = () => {
		cleanup();
		if (!res.writableEnded) res.end();
	};
	const queueStreamWork = (work) => {
		streamQueue = streamQueue.then(async () => {
			if (cleanedUp || res.writableEnded) return;
			await work();
		}).catch((error) => {
			log.warn("session history SSE stream work failed; closing stream", { error });
			closeStream();
		});
	};
	const isStreamStillAuthorized = async () => {
		const cfgLocal = getRuntimeConfig();
		const currentRequestAuth = await checkGatewayHttpRequestAuth({
			req,
			auth: opts.getResolvedAuth?.() ?? opts.auth,
			trustedProxies: cfgLocal.gateway?.trustedProxies,
			allowRealIpFallback: cfgLocal.gateway?.allowRealIpFallback,
			rateLimiter: opts.rateLimiter,
			cfg: cfgLocal
		});
		if (!currentRequestAuth.ok) return false;
		return authorizeOperatorScopesForMethod("chat.history", resolveSharedSecretHttpOperatorScopes(req, currentRequestAuth.requestAuth)).allowed;
	};
	const heartbeat = setInterval(() => {
		queueStreamWork(async () => {
			if (!await isStreamStillAuthorized()) {
				closeStream();
				return;
			}
			if (!res.writableEnded) res.write(": keepalive\n\n");
		});
	}, 15e3);
	const unsubscribe = onSessionTranscriptUpdate((update) => {
		if (!entry?.sessionId) return;
		const updatePath = resolveTranscriptPathForComparison(update.sessionFile);
		if (!updatePath || !transcriptCandidates.has(updatePath)) return;
		queueStreamWork(async () => {
			if (res.writableEnded) return;
			if (!await isStreamStillAuthorized()) {
				closeStream();
				return;
			}
			if (update.message !== void 0) {
				if (limit === void 0 && cursor === void 0) {
					const nextEvent = sseState.appendInlineMessage({
						message: update.message,
						messageId: update.messageId,
						messageSeq: update.messageSeq
					});
					if (!nextEvent) return;
					if (nextEvent.shouldRefresh) {
						sentHistory = await sseState.refreshAsync();
						sseWrite(res, "history", {
							sessionKey: target.canonicalKey,
							...sentHistory
						});
						return;
					}
					if (nextEvent.message === void 0) return;
					sentHistory = sseState.snapshot();
					sseWrite(res, "message", {
						sessionKey: target.canonicalKey,
						message: nextEvent.message,
						...typeof update.messageId === "string" ? { messageId: update.messageId } : {},
						messageSeq: nextEvent.messageSeq
					});
					return;
				}
			}
			sentHistory = await sseState.refreshAsync();
			sseWrite(res, "history", {
				sessionKey: target.canonicalKey,
				...sentHistory
			});
		});
	});
	req.on("close", cleanup);
	res.on("close", cleanup);
	res.on("finish", cleanup);
	return true;
}
//#endregion
export { handleSessionHistoryHttpRequest };
