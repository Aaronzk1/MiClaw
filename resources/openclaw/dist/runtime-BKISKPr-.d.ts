import { $n as PluginRuntime } from "./types-C0dQmare.js";
import { f as sendMessageDiscord } from "./send-BFEJXOrq.js";
import { t as discordMessageActions } from "./channel-actions-BIx8hABM.js";

//#region extensions/discord/src/runtime.d.ts
type DiscordChannelRuntime = {
  messageActions?: typeof discordMessageActions;
  sendMessageDiscord?: typeof sendMessageDiscord;
};
type DiscordRuntime = PluginRuntime & {
  channel: PluginRuntime["channel"] & {
    discord?: DiscordChannelRuntime;
  };
};
declare const setDiscordRuntime: (next: DiscordRuntime) => void, getOptionalDiscordRuntime: () => DiscordRuntime | null, getDiscordRuntime: () => DiscordRuntime;
//#endregion
export { setDiscordRuntime as t };