import { i as OpenClawConfig } from "./types.openclaw-DABkiMzt.js";
import { r as ChannelConfigUiHint } from "./types.config-D1pSqbn8.js";
import { t as ChannelPlugin } from "./types.plugin-DWT_kqSo.js";
import { $n as PluginRuntime } from "./types-BVAOMoZy.js";
import { r as buildChannelConfigSchema } from "./config-schema-CIXTfG6L.js";
import { r as parseOptionalDelimitedEntries } from "./helpers-Cywi54Bs.js";
import { L as PluginCommandContext, g as OpenClawPluginApi } from "./plugin-entry-DTAJN0z5.js";
import { t as clearAccountEntryFields } from "./config-helpers-CWPbql5g.js";
import { c as tryReadSecretFileSync } from "./secret-file-CjbjgOXf.js";
import { a as buildThreadAwareOutboundSessionRoute, c as defineChannelPluginEntry, f as recoverCurrentThreadSessionId, i as buildChannelOutboundSessionRoute, l as defineSetupPluginEntry, m as stripTargetKindPrefix, o as createChannelPluginBase$1, p as stripChannelTargetPrefix, s as createChatChannelPlugin, t as ChannelOutboundSessionRouteParams } from "./core-HhTaqQ72.js";

//#region src/plugin-sdk/channel-core.d.ts
/** Creates a channel plugin base while keeping the public import on this SDK subpath. */
declare const createChannelPluginBase: typeof createChannelPluginBase$1;
//#endregion
export { type ChannelConfigUiHint, type ChannelOutboundSessionRouteParams, type ChannelPlugin, type OpenClawConfig, type OpenClawPluginApi, type PluginCommandContext, type PluginRuntime, buildChannelConfigSchema, buildChannelOutboundSessionRoute, buildThreadAwareOutboundSessionRoute, clearAccountEntryFields, createChannelPluginBase, createChatChannelPlugin, defineChannelPluginEntry, defineSetupPluginEntry, parseOptionalDelimitedEntries, recoverCurrentThreadSessionId, stripChannelTargetPrefix, stripTargetKindPrefix, tryReadSecretFileSync };