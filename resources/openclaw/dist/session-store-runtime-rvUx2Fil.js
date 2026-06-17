import "./paths-NEwU8m3X.js";
import { t as loadSessionStore$1 } from "./store-load-C4uq6Lrq.js";
import "./store-Qsgtu-0y.js";
import "./reset-D9vnBMp0.js";
import "./session-key-DNlvhlw9.js";
import "./transcript-Cw-EfeYD.js";
import "./send-policy-CfC5ATxp.js";
//#region src/plugin-sdk/session-store-runtime.ts
/**
* @deprecated Use getSessionEntry/listSessionEntries for reads and
* patchSessionEntry/upsertSessionEntry for writes. loadSessionStore keeps the
* legacy mutable whole-store shape and will remain a compatibility escape hatch.
*/
const loadSessionStore = loadSessionStore$1;
//#endregion
export { loadSessionStore as t };
