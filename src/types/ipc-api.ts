export interface IpcResult<T = void> { ok: boolean; data?: T; error?: string }

export interface Conversation { id: string; title: string; model: string; createdAt: string; updatedAt: string; parentConvId?: string; forkPoint?: number }
export interface Message { role: string; content: string; timestamp?: string; tokens?: number; pinned?: boolean }
export interface Agent { id: string; name: string; model?: string; systemPrompt?: string; identity?: string; expertise?: string; description?: string; color?: string; enabled?: boolean; skills?: string[]; mcpServers?: string[]; temperature?: number; maxTokens?: number }
export interface Provider { id: string; name: string; baseUrl?: string; apiKey?: string; models?: any[]; enabled?: boolean }
export interface Model { id: string; name: string; provider?: string; baseUrl?: string; apiId?: string; contextWindow?: number; maxTokens?: number; temperature?: number; enabled?: boolean }
export interface Skill { id: string; name: string; description?: string; category?: string; source?: string; enabled?: boolean }
export interface McpServer { id: string; name: string; command?: string; args?: string[]; url?: string; transport?: string; env?: Record<string, string>; cwd?: string; enabled?: boolean; status?: string }
export interface Group { id: string; name: string; members?: string[]; leader?: string; createdAt?: string }
export interface GcMessage { id: string; groupId: string; senderId: string; senderName: string; role: string; content: string; timestamp?: string; bookmarked?: boolean; pinned?: boolean; thinking?: string; toolCalls?: string }
export interface FileInfo { name: string; path: string; isDir: boolean; size: number; modified?: string }
export interface GatewayStatus { running: boolean; port: number }
export interface SystemInfo { version: string; platform: string; arch: string; electron?: string; chrome?: string; node?: string; userData?: string }
export interface Config { gateway?: { host: string; port: number }; ai?: { provider: string; model: string; maxTokens: number; temperature: number; apiKey?: string }; context?: { maxTokens: number; threshold: number; targetRatio: number; strategy: string }; apiServer?: { enabled: boolean; port: number; apiKey?: string }; theme?: string; [key: string]: any }

export interface BackupMeta { timestamp: string; size: number; messages: number; conversations: number; path?: string }
export interface Prompt { id: string; name: string; content: string; category?: string; vars?: string[] }

export interface MiClawAPI {
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
  getConfig(): Promise<Config>
  saveConfig(c: Config): Promise<boolean>
  convList(): Promise<Conversation[]>
  convCreate(title: string, model?: string, agentId?: string): Promise<string>
  convDelete(id: string): Promise<void>
  convMessages(cid: string): Promise<Message[]>
  convSave(cid: string, role: string, content: string, toolCalls?: string, thinking?: string): Promise<void>
  convUpdateTitle(cid: string, title: string): Promise<boolean>
  convFork(convId: string, messageIndex: number): Promise<string | null>
  agentsList(): Promise<Agent[]>
  agentsSave(a: Agent): Promise<void>
  agentsDelete(id: string): Promise<void>
  agentsToggle(id: string, enabled: boolean): Promise<void>
  providersList(): Promise<Provider[]>
  providersSave(p: Provider): Promise<void>
  providersDelete(id: string): Promise<void>
  providersToggle(id: string, enabled: boolean): Promise<void>
  modelsList(): Promise<Model[]>
  modelsSave(m: Model): Promise<void>
  modelsDelete(id: string): Promise<void>
  modelsToggle(id: string, enabled: boolean): Promise<void>
  // Calendar
  calendarCreate(event: { title: string; description?: string; startTime: string; endTime?: string; reminder?: number; recurring?: string; category?: string }): Promise<any>
  calendarList(startDate?: string, endDate?: string): Promise<any[]>
  calendarUpcoming(): Promise<any[]>
  calendarToday(): Promise<any[]>
  calendarUpdate(id: string, updates: any): Promise<{ ok: boolean }>
  calendarDelete(id: string): Promise<{ ok: boolean }>
  calendarReminders(minutes?: number): Promise<any[]>

  gcGroups(): Promise<Group[]>
  gcMessages(gid: string): Promise<GcMessage[]>
  gcSend(gid: string, msg: string): Promise<{ ok: boolean; replies?: Array<{ agentId: string; agentName: string; reply?: string; error?: string }>; error?: string }>
  gcMembers(gid: string): Promise<Agent[]>
  gcAddMember(gid: string, aid: string): Promise<void>
  gcSave(group: any): Promise<void>
  gcBookmark(id: string): Promise<void>
  gcUnbookmark(id: string): Promise<void>
  gcBookmarks(gid: string): Promise<any[]>
  gcDelete(id: string): Promise<void>
  gcClearMessages(gid: string): Promise<boolean>
  gcPin(id: string): Promise<void>
  gcPinned(gid: string): Promise<any[]>
  // GC Streaming
  gcStreamSend(gid: string, msg: string): Promise<void>
  onGcStreamToken(cb: (d: { groupId: string; token: string }) => void): void
  onGcStreamThinking(cb: (d: { groupId: string; text: string }) => void): void
  onGcStreamTool(cb: (d: { groupId: string; id: string; name: string; status: string; args?: string; output?: string; error?: string }) => void): void
  onGcStreamDone(cb: (d: { groupId: string; text: string; thinking?: string; toolCalls?: any[] }) => void): void
  onGcStreamError(cb: (d: { groupId: string; error: string }) => void): void
  onGcStreamDecomposition(cb: (d: { groupId: string; steps: Array<{ id: string; agentId: string; agentName: string; task: string }> }) => void): void
  onGcStreamSpeaker(cb: (d: { groupId: string; agentId: string; agentName: string }) => void): void
  gatewayStatus(): Promise<GatewayStatus>
  gatewayStart(): Promise<{ ok: boolean; error?: string }>
  gatewayInfo(): Promise<{ running: boolean; port?: number; sessions?: any[]; providers?: any[]; tools?: any[] }>
  // Templates
  templatesList(): Promise<Prompt[]>
  templatesSave(t: Partial<Prompt>): Promise<Prompt>
  templatesDelete(id: string): Promise<void>
  templatesForAgent(agentId: string): Promise<Prompt[]>
  // TTS
  ttsSpeak(text: string, lang?: string): Promise<{ ok: boolean }>
  ttsStop(): Promise<{ ok: boolean }>
  ttsVoices(): Promise<any[]>
  // Clipboard
  clipboardHistory(): Promise<Array<{ text: string; timestamp: number }>>
  clipboardPick(text: string): Promise<{ ok: boolean }>
  clipboardClear(): Promise<{ ok: boolean }>
  chatSend(opts: { message: string; history?: any[]; model?: string; agentId?: string; convId?: string }): Promise<{ ok: boolean; text?: string; error?: string }>
  chatCancel(): Promise<boolean>
  chatCompare(opts: { message: string; modelIds: string[] }): Promise<{ ok: boolean; results: Array<{ model: string; text: string; ok: boolean; error?: string }> }>
  ollamaStatus(): Promise<{ running: boolean; models: string[] }>
  onChatToken(cb: (t: string) => void): void
  onChatThinking(cb: (t: string) => void): void
  onChatDone(cb: (t: string, thinking?: string, toolCalls?: any[]) => void): void
  onChatUsage(cb: (u: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void): void
  onChatModel(cb: (m: string) => void): void
  onChatError(cb: (e: string) => void): void
  onCompareResult(cb: (d: { modelId: string; text: string; thinking?: string; toolCalls?: any[]; ok: boolean; error?: string }) => void): void
  onCompareToken(cb: (d: { modelId: string; token: string }) => void): void
  onCompareThinking(cb: (d: { modelId: string; token: string }) => void): void
  onCompareToolStatus(cb: (d: { modelId: string; id: string; name: string; status: string; error?: string }) => void): void
  onToolStatus(cb: (d: { id: string; name: string; status: string; output?: string; error?: string }) => void): void
  filesList(dir?: string): Promise<FileInfo[]>
  filesRead(fp: string): Promise<{ ok: boolean; content?: string; size?: number; error?: string }>
  filesOpen(fp: string): Promise<void>
  systemInfo(): Promise<SystemInfo>
  settingsGet(key: string): Promise<any>
  settingsSet(key: string, val: any): Promise<void>
  draftSave(convId: string, text: string): Promise<void>
  draftGet(convId: string): Promise<string>
  dataExport(): Promise<{ ok: boolean; path?: string }>
  dataImport(path: string): Promise<{ ok: boolean; error?: string }>
  healthCheck(): Promise<{ gateway: boolean; port: number }>
  cryptoEncrypt(text: string): Promise<string>
  cryptoDecrypt(encoded: string): Promise<string>
  notify(title: string, body: string): Promise<void>
  // Backup
  backupCreate(): Promise<BackupMeta | null>
  backupList(): Promise<BackupMeta[]>
  backupRestore(path: string): Promise<boolean>
  // Search
  searchMessages(query: string, limit?: number): Promise<Array<{ convId: string; role: string; content: string; timestamp: string; convTitle: string }>>
  // Logs
  logsList(): Promise<Array<{ name: string; path: string; size: number }>>
  logsRead(filename: string): Promise<string>
  logsDir(): Promise<string>
  // Generated files
  generatedFilesList(): Promise<Array<{ id?: string; path: string; name: string; size: number; tool?: string; createdAt?: string }>>
  generatedFilesDelete(id: string): Promise<void>
  generatedFilesClear(): Promise<void>
  // Channel management
  channelStatus(): Promise<{ running: boolean; channels: Record<string, string> }>
  channelSetup(channelId: string, credentials?: Record<string, string>): Promise<{ ok: boolean; message?: string }>
  channelDisconnect(channelId: string): Promise<{ ok: boolean; message?: string }>
  channelWeixinQr(): Promise<{ ok: boolean; uuid?: string; qrUrl?: string; message?: string }>
  channelWeixinPoll(uuid: string): Promise<{ status: string; redirectUrl?: string; message?: string }>
  // Plugins
  pluginsList(): Promise<{ installed: any[]; available: any[] }>
  pluginsDetails(id: string): Promise<{ id: string; readme: string } | null>
  pluginsOpenDir(): Promise<void>
  pluginsInstall(id: string, source?: string): Promise<{ ok: boolean; fallback?: boolean; error?: string }>
  pluginsUninstall(id: string): Promise<{ ok: boolean; error?: string }>
  pluginsSearch(query: string): Promise<any[]>
  pluginsCheckUpdates(): Promise<Array<{ id: string; current: string; latest: string }>>
  // MCP Servers
  mcpList(): Promise<McpServer[]>
  mcpSave(server: Partial<McpServer> & { id: string }): Promise<{ ok: boolean; error?: string }>
  mcpDelete(id: string): Promise<{ ok: boolean; error?: string }>
  mcpToggle(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }>
  mcpProbe(id: string): Promise<{ ok: boolean; tools?: any[]; error?: string }>
  mcpTools(): Promise<any[]>
  // Skills
  skillsList(): Promise<Array<{ id: string; label: string; desc: string; emoji?: string; source: string }>>
  // Window management
  windowOpen(): Promise<{ id: number }>
  windowList(): Promise<Array<{ id: number; focused: boolean; visible: boolean }>>
  // Token Stats
  tokenStatsDaily(): Promise<Array<{ date: string; role: string; total: number }>>
  tokenStatsByConversation(): Promise<Array<{ title: string; total: number; msgCount: number }>>
  tokenStatsSummary(): Promise<{ totalTokens: number; totalMessages: number; avgTokensPerMessage: number; totalConversations: number; tokensLast7Days: number }>
  // MaxMode
  chatMaxmode(opts: { message: string; history: any[]; model?: string; agentId?: string; convId?: string; proposalCount?: number }): Promise<{ ok: boolean; proposals: Array<{ id: number; temperature: number; text: string; thinking: string; ok: boolean; error?: string }>; judgePick: number }>
  onMaxmodeToken(cb: (d: { proposalId: number; token: string }) => void): () => void
  onMaxmodeThinking(cb: (d: { proposalId: number; token: string }) => void): () => void
  onMaxmodeDone(cb: (d: { proposalId: number; text: string; thinking: string; ok: boolean; error?: string }) => void): () => void
  onMaxmodeJudge(cb: (d: { bestId: number }) => void): () => void
  // Goal Judge
  chatGoalJudge(opts: { question: string; response: string; model?: string }): Promise<{ ok: boolean; score: number; complete: boolean; issues: string[]; suggestion: string }>
  analyticsHeatmap(): Promise<Array<{ date: string; count: number }>>
  analyticsSummary(): Promise<{ totalMessages: number; totalConversations: number; activeDays: number; longestStreak: number }>
  // App lifecycle
  appReady(): Promise<void>
}