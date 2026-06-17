import { i as OpenClawConfig } from "./types.openclaw-DABkiMzt.js";
import { c as normalizeOptionalString } from "./string-coerce-CHpWMcj5.js";
import { $o as SpeechModelOverridePolicy, Go as ResolvedTtsModelOverrides, Jo as TTS_AUTO_MODES, Ko as TtsConfigResolutionContext, Qo as SpeechListVoicesRequest, Wc as requireApiKey, Wo as ResolvedTtsConfig, Xo as SpeechDirectiveTokenParseContext, Yo as normalizeTtsAutoMode, Zo as SpeechDirectiveTokenParseResult, as as SpeechProviderPreparedSynthesis, cs as SpeechProviderResolveTalkOverridesContext, ds as SpeechSynthesisStreamResult, es as SpeechProviderConfig, fs as SpeechSynthesisTarget, gs as TtsDirectiveParseResult, hc as prepareSimpleCompletionModel, hs as TtsDirectiveOverrides, is as SpeechProviderPrepareSynthesisContext, ls as SpeechSynthesisRequest, ms as SpeechVoiceOption, os as SpeechProviderResolveConfigContext, ps as SpeechTelephonySynthesisRequest, qn as SpeechProviderPlugin, qo as resolveEffectiveTtsConfig, rs as SpeechProviderOverrides, ss as SpeechProviderResolveTalkConfigContext, ts as SpeechProviderConfiguredContext, us as SpeechSynthesisStreamRequest } from "./types-BVAOMoZy.js";
import { t as asBoolean } from "./boolean-CThIQsGO.js";
import { r as completeSimple } from "./stream-DgoH2jdD.js";
import { o as asFiniteNumber } from "./number-coercion-Ds_8dOjj.js";
import { a as createProviderHttpError, c as formatProviderErrorPayload, h as truncateErrorDetail, l as formatProviderHttpErrorMessage, m as readResponseTextLimited, o as extractProviderErrorDetail, r as assertOkOrThrowProviderError, s as extractProviderRequestId, t as asObject } from "./provider-http-errors-C4q5ZYJB.js";
import { a as normalizeSpeechProviderId, c as normalizeLanguageCode, d as scheduleCleanup, i as listSpeechProviders, l as normalizeSeed, n as getSpeechProvider, o as parseTtsDirectives, r as listLoadedSpeechProviders, s as normalizeApplyTextNormalization, t as canonicalizeSpeechProviderId, u as requireInRange } from "./provider-registry-DSa1bEUu.js";

//#region src/tts/tts-core.d.ts
type SummarizeTextDeps = {
  completeSimple: typeof completeSimple;
  prepareSimpleCompletionModel: typeof prepareSimpleCompletionModel;
  requireApiKey: typeof requireApiKey;
};
type SummarizeResult = {
  summary: string;
  latencyMs: number;
  inputLength: number;
  outputLength: number;
};
/** Summarize long text before synthesis using the configured summary model. */
declare function summarizeText(params: {
  text: string;
  targetLength: number;
  cfg: OpenClawConfig;
  config: ResolvedTtsConfig;
  timeoutMs: number;
}, deps?: SummarizeTextDeps): Promise<SummarizeResult>;
//#endregion
//#region src/tts/directive-number.d.ts
/** Numeric directive parsing shared by speech providers with bounded knobs. */
type DirectiveNumberRange = {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
};
/** Parse a numeric speech directive token and return provider overrides when policy allows it. */
declare function parseSpeechDirectiveNumberOverride(params: {
  ctx: SpeechDirectiveTokenParseContext;
  overrideKey: string;
  range: DirectiveNumberRange;
  warning: (value: string) => string;
  mergeCurrentOverrides?: boolean;
}): SpeechDirectiveTokenParseResult;
//#endregion
export { type ResolvedTtsConfig, type ResolvedTtsModelOverrides, type SpeechDirectiveTokenParseContext, type SpeechDirectiveTokenParseResult, type SpeechListVoicesRequest, type SpeechModelOverridePolicy, type SpeechProviderConfig, type SpeechProviderConfiguredContext, type SpeechProviderOverrides, type SpeechProviderPlugin, type SpeechProviderPrepareSynthesisContext, type SpeechProviderPreparedSynthesis, type SpeechProviderResolveConfigContext, type SpeechProviderResolveTalkConfigContext, type SpeechProviderResolveTalkOverridesContext, type SpeechSynthesisRequest, type SpeechSynthesisStreamRequest, type SpeechSynthesisStreamResult, type SpeechSynthesisTarget, type SpeechTelephonySynthesisRequest, type SpeechVoiceOption, TTS_AUTO_MODES, type TtsConfigResolutionContext, type TtsDirectiveOverrides, type TtsDirectiveParseResult, asBoolean, asFiniteNumber, asObject, assertOkOrThrowProviderError, canonicalizeSpeechProviderId, createProviderHttpError, extractProviderErrorDetail, extractProviderRequestId, formatProviderErrorPayload, formatProviderHttpErrorMessage, getSpeechProvider, listLoadedSpeechProviders, listSpeechProviders, normalizeApplyTextNormalization, normalizeLanguageCode, normalizeSeed, normalizeSpeechProviderId, normalizeTtsAutoMode, parseSpeechDirectiveNumberOverride, parseTtsDirectives, readResponseTextLimited, requireInRange, resolveEffectiveTtsConfig, scheduleCleanup, summarizeText, normalizeOptionalString as trimToUndefined, truncateErrorDetail };