import { i as OpenClawConfig } from "./types.openclaw-DABkiMzt.js";
import { d as SecretInput } from "./types.secrets-rAcqRhcN.js";
import { Tl as upsertAuthProfileWithLock, wl as upsertAuthProfile } from "./types-BVAOMoZy.js";
import { a as upsertApiKeyProfile, i as buildApiKeyCredential, r as applyAuthProfileConfig, t as ApiKeyStorageOptions } from "./provider-auth-helpers-CgJ95v8U.js";
import { a as normalizeSecretInputModeInput, c as promptSecretRefForSetup, i as normalizeApiKeyInput, n as ensureApiKeyFromOptionEnvOrPrompt, o as validateApiKeyInput, r as formatApiKeyPreview, s as resolveSecretInputModeForEnvSelection } from "./provider-auth-input-C5HpuBgY.js";
import { t as createProviderApiKeyAuthMethod } from "./provider-api-key-auth-B5CAM63t.js";
import { n as normalizeSecretInput, t as normalizeOptionalSecretInput } from "./normalize-secret-input-DuM-MDGm.js";
export { type ApiKeyStorageOptions, type OpenClawConfig, type SecretInput, applyAuthProfileConfig, buildApiKeyCredential, createProviderApiKeyAuthMethod, ensureApiKeyFromOptionEnvOrPrompt, formatApiKeyPreview, normalizeApiKeyInput, normalizeOptionalSecretInput, normalizeSecretInput, normalizeSecretInputModeInput, promptSecretRefForSetup, resolveSecretInputModeForEnvSelection, upsertApiKeyProfile, upsertAuthProfile, upsertAuthProfileWithLock, validateApiKeyInput };