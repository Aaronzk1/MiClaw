export interface IpcResult<T = void> { ok: boolean; data?: T; error?: string }

export interface Conversation { id: string; title: string; model: string; createdAt: string; updatedAt: string; parentConvId?: string; forkPoint?: number }
export interface Message { role: string; content: string; timestamp?: string; tokens?: number; pinned?: boolean }
export interface Agent { id: string; name: string; model?: string; systemPrompt?: string; color?: string; enabled?: boolean; skills?: string[] }
export interface Provider { id: string; name: string; baseUrl?: string; apiKey?: string; models?: any[]; enabled?: boolean }
export interface Model { id: string; name: string; provider?: string; contextWindow?: number; maxTokens?: number; temperature?: number; enabled?: boolean }
export interface Skill { id: string; name: string; description?: string; category?: string; source?: string; enabled?: boolean }
export interface Memory { id: string; content: string; category?: string; importance?: number; createdAt?: string; source?: string }
export interface CronJob { id: string; name?: string; command?: string; schedule?: string; enabled?: boolean }
export interface McpServer { id: string; name: string; command?: string; type?: string; enabled?: boolean; status?: string }
export interface Group { id: string; name: string; members?: string[]; createdAt?: string }
export interface GcMessage { id: string; groupId: string; senderId: string; senderName: string; role: string; content: string; timestamp?: string; bookmarked?: boolean; pinned?: boolean }
export interface FileInfo { name: string; path: string; isDir: boolean; size: number; modified?: string }
export interface GatewayStatus { running: boolean; port: number }
export interface SystemInfo { version: string; platform: string; arch: string; electron?: string; chrome?: string; node?: string; userData?: string }
export interface Config { gateway?: { host: string; port: number }; ai?: { provider: string; model: string; maxTokens: number; temperature: number; apiKey?: string }; context?: { maxTokens: number; threshold: number; targetRatio: number; strategy: string }; apiServer?: { enabled: boolean; port: number; apiKey?: string }; theme?: string; [key: string]: any }

export interface RagDocument { id: string; filename: string; chunkCount: number; createdAt: string }
export interface RagSearchResult { text: string; score: number; docId: string }
export interface Workflow { id: string; name: string; description?: string; nodes: any[]; enabled: boolean; createdAt: string; lastRun?: string; runCount?: number }
export interface WorkflowResult { success: boolean; output: string; steps: Array<{ nodeId: string; type: string; input: string; output: string; duration: number }> }
export interface BackupMeta { timestamp: string; size: number; messages: number; conversations: number; path?: string }
export interface Prompt { id: string; name: string; content: string; category?: string; vars?: string[] }
export interface CircuitStatus { state: string; failures: number }
export interface CronExecutionResult { success: boolean; output?: string; error?: string; duration: number; blocked?: boolean }
export interface CronExecutionRecord { jobId: string; command: string; result: CronExecutionResult; timestamp: string }

export interface AaronClawAPI {
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
  getConfig(): Promise<Config>
  saveConfig(c: Config): Promise<boolean>
  convList(): Promise<Conversation[]>
  convCreate(title: string, model?: string): Promise<string>
  convDelete(id: string): Promise<void>
  convMessages(cid: string): Promise<Message[]>
  convSave(cid: string, role: string, content: string): Promise<void>
  convFork(convId: string, messageIndex: number): Promise<string | null>
  agentsList(): Promise<Agent[]>
  agentsSave(a: Agent): Promise<void>
  agentsDelete(id: string): Promise<void>
  agentsToggle(id: string, enabled: boolean): Promise<void>
  providersList(): Promise<Provider[]>
  providersSave(p: Provider): Promise<void>
  providersDelete(id: string): Promise<void>
  modelsList(): Promise<Model[]>
  modelsSave(m: Model): Promise<void>
  modelsToggle(id: string, enabled: boolean): Promise<void>
  skillsList(): Promise<Skill[]>
  skillsToggle(id: string, enabled: boolean): Promise<void>
  memoryList(): Promise<Memory[]>
  memorySearch(q: string): Promise<Memory[]>
  memoryAdd(content: string, category: string): Promise<string>
  memoryDelete(id: string): Promise<void>
  cronList(): Promise<CronJob[]>
  cronSave(j: CronJob): Promise<void>
  cronDelete(id: string): Promise<void>
  cronHistory(jobId?: string): Promise<CronExecutionRecord[]>
  mcpList(): Promise<McpServer[]>
  mcpSave(s: McpServer): Promise<void>
  gcGroups(): Promise<Group[]>
  gcMessages(gid: string): Promise<GcMessage[]>
  gcSend(gid: string, msg: string): Promise<{ ok: boolean; reply?: string; agentId?: string; agentName?: string; error?: string }>
  gcMembers(gid: string): Promise<Agent[]>
  gcAddMember(gid: string, aid: string): Promise<void>
  gcSave(group: any): Promise<void>
  gcBookmark(id: string): Promise<void>
  gcUnbookmark(id: string): Promise<void>
  gcBookmarks(gid: string): Promise<any[]>
  gcPin(id: string): Promise<void>
  gcPinned(gid: string): Promise<any[]>
  gatewayStatus(): Promise<GatewayStatus>
  gatewayStart(): Promise<{ ok: boolean; error?: string }>
  gatewayCircuit(): Promise<CircuitStatus>
  chatSend(opts: { message: string; history?: any[]; systemPrompt?: string; model?: string; convId?: string }): Promise<{ ok: boolean; text?: string; error?: string }>
  chatCancel(): Promise<boolean>
  onChatToken(cb: (t: string) => void): void
  onChatThinking(cb: (t: string) => void): void
  onChatToolCall(cb: (d: any) => void): void
  onChatDone(cb: (t: string) => void): void
  onChatError(cb: (e: string) => void): void
  onGcToken(cb: (t: string) => void): void
  onGcDone(cb: (t: string) => void): void
  filesList(dir?: string): Promise<FileInfo[]>
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
  capTts(text: string, voice?: string): Promise<{ ok: boolean; path?: string; error?: string }>
  capImageGen(prompt: string, size?: string): Promise<{ ok: boolean; url?: string; revised_prompt?: string; error?: string }>
  capTranscribe(audioPath: string): Promise<{ ok: boolean; text?: string; error?: string }>
  capDocExtract(filePath: string): Promise<{ ok: boolean; content?: string; filename?: string; error?: string }>
  capWebSearch(query: string): Promise<{ ok: boolean; results?: string; error?: string }>
  capEmbed(text: string): Promise<{ ok: boolean; embedding?: number[]; error?: string }>
  capInsights(days?: number): Promise<{ ok: boolean; data?: string; error?: string }>
  capDoctor(): Promise<{ ok: boolean; data?: string; error?: string }>
  capSessions(query?: string): Promise<{ ok: boolean; data?: string; error?: string }>
  capKanban(action: string, args?: string): Promise<{ ok: boolean; data?: string; error?: string }>
  capPlayAudio(path: string): Promise<{ ok: boolean }>
  onAudioReady(cb: (path: string) => void): void
  // Voice
  voiceStart(): Promise<{ ok: boolean }>
  voiceChunk(chunk: string): Promise<{ ok: boolean }>
  voiceStop(): Promise<{ ok: boolean; text?: string; error?: string }>
  // RAG
  ragImport(filePath: string): Promise<{ ok: boolean; docId?: string; error?: string }>
  ragList(): Promise<RagDocument[]>
  ragDelete(docId: string): Promise<void>
  ragSearch(query: string, topK?: number): Promise<RagSearchResult[]>
  // Workflows
  wfList(): Promise<Workflow[]>
  wfSave(wf: Workflow): Promise<void>
  wfDelete(id: string): Promise<void>
  wfExecute(id: string, input: string): Promise<WorkflowResult>
  wfPresets(): Promise<Workflow[]>
  // Backup
  backupCreate(): Promise<BackupMeta | null>
  backupList(): Promise<BackupMeta[]>
  backupRestore(path: string): Promise<boolean>
  // Prompts
  promptsList(): Promise<Prompt[]>
  promptsSave(p: Prompt): Promise<void>
  promptsDelete(id: string): Promise<void>
  // Search
  searchMessages(query: string, limit?: number): Promise<Array<{ convId: string; role: string; content: string; timestamp: string; convTitle: string }>>
  // Logs
  logsList(): Promise<string[]>
  logsRead(filename: string): Promise<string>
  logsDir(): Promise<string>
  // Generic invoke
  invoke(channel: string, ...args: any[]): Promise<any>
}