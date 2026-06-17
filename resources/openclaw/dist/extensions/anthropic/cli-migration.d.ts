import { i as OpenClawConfig } from "../../types.openclaw-DBHlrrVj.js";
import { jt as ProviderAuthResult } from "../../types-C0dQmare.js";
import { n as readClaudeCliCredentialsForSetup } from "../../cli-auth-seam-BZ-IAa37.js";
//#region extensions/anthropic/cli-migration.d.ts
type ClaudeCliCredential = NonNullable<ReturnType<typeof readClaudeCliCredentialsForSetup>>;
/** Return whether Claude CLI credentials are available for setup migration. */
declare function hasClaudeCliAuth(options?: {
  allowKeychainPrompt?: boolean;
}): boolean;
/** Build the config migration result for adopting Claude CLI-backed Anthropic defaults. */
declare function buildAnthropicCliMigrationResult(config: OpenClawConfig, credential?: ClaudeCliCredential | null): ProviderAuthResult;
//#endregion
export { buildAnthropicCliMigrationResult, hasClaudeCliAuth };