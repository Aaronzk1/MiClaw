import { qn as SpeechProviderPlugin, vs as SpeechVoiceOption } from "../../types-C0dQmare.js";
//#region extensions/microsoft/speech-provider.d.ts
declare function isCjkDominant(text: string): boolean;
declare function listMicrosoftVoices(): Promise<SpeechVoiceOption[]>;
declare function buildMicrosoftSpeechProvider(): SpeechProviderPlugin;
//#endregion
export { buildMicrosoftSpeechProvider, isCjkDominant, listMicrosoftVoices };