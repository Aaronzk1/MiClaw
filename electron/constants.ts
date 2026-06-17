// Backend constants — single source of truth

// Ports & URLs
export const DEFAULT_GATEWAY_PORT = 18789
export const OLLAMA_BASE_URL = 'http://localhost:11434'
export const API_PATH_CHAT = '/v1/chat/completions'
export const API_PATH_OLLAMA_TAGS = '/api/tags'

// Defaults
export const DEFAULT_MODEL = 'openclaw'
export const DEFAULT_AGENT_ID = 'default'

// Timeouts (ms)
export const TIMEOUT_HEALTH_CHECK = 2000
export const TIMEOUT_GATEWAY_SCAN = 30000
export const TIMEOUT_GATEWAY_START = 60000
export const TIMEOUT_CHAT = 180000
export const TIMEOUT_TOOL_EXEC = 120000
export const TIMEOUT_QUICK_FETCH = 5000

// Limits
export const MAX_HISTORY_MESSAGES = 50
export const MAX_DEBUG_LOGS = 100
export const MAX_TOOL_OUTPUT_LEN = 8000
export const MAX_LOG_CHARS = 10000
