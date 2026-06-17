import { i as OpenClawConfig } from "../../types.openclaw-DBHlrrVj.js";
import { U as ChannelLegacyStateMigrationPlan } from "../../types.core-CyK4WLl_.js";
//#region extensions/telegram/src/state-migrations.d.ts
declare function detectTelegramLegacyStateMigrations(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  stateDir?: string;
}): Promise<ChannelLegacyStateMigrationPlan[]>;
//#endregion
export { detectTelegramLegacyStateMigrations };