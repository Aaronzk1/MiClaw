import { l as MigrationItem } from "../../plugin-entry-BOAJmgcf.js";
import { t as HermesSource } from "../../source-BWpYJbX3.js";
import { t as PlannedTargets } from "../../targets-RBjRnVNP.js";

//#region extensions/migrate-hermes/skills.d.ts
declare function buildSkillItems(params: {
  source: HermesSource;
  targets: PlannedTargets;
  overwrite?: boolean;
}): Promise<MigrationItem[]>;
//#endregion
export { buildSkillItems };