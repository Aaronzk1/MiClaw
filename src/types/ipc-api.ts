export interface IpcResult<T = void> { ok: boolean; data?: T; error?: string }

export interface Conversation { id: string; title: string; model: string; createdAt: string; updatedAt: string; parentConvId?: string; forkPoint?: number }
export interface Message { role: string; content: string; timestamp?: string; tokens?: number; pinned?: boolean }
export interface Agent { id: string; name: string; model?: string; systemPrompt?: string; identity?: string; expertise?: string; description?: string; color?: string; enabled?: boolean; skills?: string[]; mcpServers?: string[]; temperature?: number; maxTokens?: number }
export interface Provider { id: string; name: string; baseUrl?: string; apiKey?: string; models?: any[]; enabled?: boolean }
export interface Model { id: string; name: string; provider?: string; baseUrl?: string; apiId?: string; contextWindow?: number; maxTokens?: number; temperature?: number; enabled?: boolean }
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
  convCreate(title: string, model?: string, agentId?: string): Promise<string>
  convDelete(id: string): Promise<void>
  convMessages(cid: string): Promise<Message[]>
  convSave(cid: string, role: string, content: string): Promise<void>
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
  skillsList(): Promise<Skill[]>
  skillsSave(item: any): Promise<void>
  skillsDelete(id: string): Promise<void>
  skillsToggle(id: string, enabled: boolean): Promise<void>
  memoryList(): Promise<Memory[]>
  memorySearch(q: string): Promise<Memory[]>
  memoryAdd(content: string, category: string): Promise<string>
  memoryDelete(id: string): Promise<void>
  memorySave(id: string, content: string, category?: string): Promise<boolean>
  memoryDream(): Promise<{ consolidated: number; removed: number; insights: string[] }>
  // TTS
  ttsSpeak(text: string, voice?: string): Promise<{ ok: boolean; error?: string }>
  ttsVoices(): Promise<Array<{ name: string; lang: string }>>
  ttsStop(): Promise<{ ok: boolean }>
  // Permissions
  permissionsCheck(context: { tool?: string; path?: string; command?: string }): Promise<{ level: 'allow' | 'ask' | 'deny'; rule?: string }>
  permissionsList(): Promise<Array<{ pattern: string; level: string; scope: string }>>
  permissionsSave(rule: { pattern: string; level: string; scope: string }): Promise<{ ok: boolean }>
  // Templates
  templatesList(): Promise<Array<{ id: string; name: string; description: string; agentId: string; prompt: string; category: string }>>
  templatesForAgent(agentId: string): Promise<Array<{ id: string; name: string; description: string; prompt: string; category: string }>>
  templatesSave(template: { id: string; name: string; description: string; agentId: string; prompt: string; category: string }): Promise<{ ok: boolean }>
  // Computer Use
  computerScreenshot(region?: { x: number; y: number; width: number; height: number }): Promise<{ ok: boolean; data?: string; error?: string }>
  computerClick(x: number, y: number, button?: string): Promise<{ ok: boolean; error?: string }>
  computerType(text: string): Promise<{ ok: boolean; error?: string }>
  computerScroll(direction: string, amount?: number): Promise<{ ok: boolean; error?: string }>
  computerScreenSize(): Promise<{ width: number; height: number }>
  // Browser Agent
  browserNavigate(url: string): Promise<{ ok: boolean; title?: string; error?: string }>
  browserGetContent(): Promise<{ ok: boolean; text?: string; title?: string; url?: string; error?: string }>
  browserClick(selector: string): Promise<{ ok: boolean; error?: string }>
  browserType(selector: string, text: string): Promise<{ ok: boolean; error?: string }>
  browserScreenshot(): Promise<{ ok: boolean; data?: string; error?: string }>
  browserExtractLinks(): Promise<{ ok: boolean; links?: Array<{ text: string; href: string }>; error?: string }>
  browserClose(): Promise<{ ok: boolean }>
  // Calendar
  calendarCreate(event: { title: string; description?: string; startTime: string; endTime?: string; reminder?: number; recurring?: string; category?: string }): Promise<any>
  calendarList(startDate?: string, endDate?: string): Promise<any[]>
  calendarUpcoming(): Promise<any[]>
  calendarToday(): Promise<any[]>
  calendarUpdate(id: string, updates: any): Promise<{ ok: boolean }>
  calendarDelete(id: string): Promise<{ ok: boolean }>
  calendarReminders(minutes?: number): Promise<any[]>
  // Max Mode
  maxmodeGenerate(prompt: string, systemPrompt: string, models: string[], temperatures?: number[]): Promise<Array<{ model: string; response: string; temperature: number }>>
  maxmodeJudge(prompt: string, candidates: Array<{ model: string; response: string; temperature: number }>): Promise<{ best: { model: string; response: string; temperature: number }; reasoning: string }>
  // Distill
  distillAnalyze(): Promise<Array<{ id: string; name: string; description: string; pattern: string; frequency: number; confidence: number }>>
  distillSave(skill: any): Promise<{ ok: boolean }>
  distillList(): Promise<any[]>
  distillFromConversation(messages: any[]): Promise<any>
  cronList(): Promise<CronJob[]>
  cronSave(j: CronJob): Promise<void>
  cronDelete(id: string): Promise<void>

  mcpList(): Promise<McpServer[]>
  mcpSave(s: McpServer): Promise<void>
  mcpDelete(id: string): Promise<void>
  mcpConnect(id: string): Promise<{ ok: boolean; tools?: any[]; error?: string }>
  mcpDisconnect(id: string): Promise<void>
  mcpCallTool(serverId: string, toolName: string, args: any): Promise<{ ok: boolean; result?: any; error?: string }>
  mcpTools(): Promise<any[]>
  mcpStatus(id: string): Promise<{ connected: boolean; tools: number }>
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
  gatewayStatus(): Promise<GatewayStatus>
  gatewayStart(): Promise<{ ok: boolean; error?: string }>
  chatSend(opts: { message: string; history?: any[]; systemPrompt?: string; model?: string; agentId?: string; convId?: string; devMode?: string }): Promise<{ ok: boolean; text?: string; error?: string }>
  chatCancel(): Promise<boolean>
  chatCompare(opts: { message: string; modelIds: string[] }): Promise<{ ok: boolean; results: Array<{ model: string; text: string; ok: boolean; error?: string }> }>
  ollamaStatus(): Promise<{ running: boolean; models: string[] }>
  chatFeedback?(opts: { type: 'regenerate' | 'fork' | 'good'; convId?: string }): Promise<{ ok: boolean }>
  chatDispatch(opts: { message: string; convId?: string }): Promise<{ ok: boolean; mode?: string; text?: string; subTasks?: any[]; error?: string }>
  onDispatchStart(cb: (d: any) => void): void
  onDispatchProgress(cb: (d: any) => void): void
  onDispatchDone(cb: (d: any) => void): void
  onChatToken(cb: (t: string) => void): void
  onChatThinking(cb: (t: string) => void): void
  onChatToolCall(cb: (d: any) => void): void
  onChatStage(cb: (stage: string) => void): void
  onChatDone(cb: (t: string, thinking?: string, toolCalls?: any[]) => void): void
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
  // RAG
  ragImport(filePath: string): Promise<{ ok: boolean; id?: string; error?: string }>
  ragList(): Promise<RagDocument[]>
  ragDelete(docId: string): Promise<void>
  ragSearch(query: string, topK?: number): Promise<RagSearchResult[]>
  // Workflows
  wfList(): Promise<Workflow[]>
  wfSave(wf: Workflow): Promise<void>
  wfDelete(id: string): Promise<void>
  wfExecute(id: string, input?: string): Promise<WorkflowResult>
  wfPresets(): Promise<Workflow[]>
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
  // Smart collaboration
  smartAnalyze(message: string): Promise<{ type: string; complexity: string; neededRoles: string[]; suggestedTeam: any[]; description: string }>
  smartCreateTeam(analysis: any): Promise<string[]>
  smartBuildWorkflow(message: string, agentIds: string[], analysis: any): Promise<any[]>
  smartExecuteStep(step: any, groupId: string, previousResults: string[]): Promise<{ ok: boolean; result?: string; error?: string }>
  // Self-evolution
  patternsTop(limit?: number): Promise<Array<{ signature: string; count: number }>>
  toolsStats(): Promise<Record<string, { calls: number; errors: number; successRate: number; qualitySum: number; qualityCount: number }>>
  toolsReliable(): Promise<string[]>
  toolsUnreliable(): Promise<string[]>
  toolsHealth(): Promise<Record<string, { status: string; detail?: string }>>
  skillsValidate(id: string): Promise<{ ok: boolean; issues?: string[] }>
  skillsMarket(): Promise<Array<{ id: string; name: string; description: string; category: string; author: string; version: string; skills: string[]; execute?: string }>>
  skillsInstallFromMarket(skill: any): Promise<{ ok: boolean; id?: string; error?: string }>
  skillsImport(content: string, source?: string): Promise<{ ok: boolean; skill?: any; error?: string }>
  // Background Goals
  goalsList(): Promise<any[]>
  goalsCreate(title: string, task: string, steps?: string[]): Promise<any>
  goalsDelete(id: string): Promise<boolean>
  goalsExecute(goalId: string): Promise<{ ok: boolean; result?: string; error?: string }>
  // Generated files
  generatedFilesList(): Promise<Array<{ id?: string; path: string; name: string; size: number; tool?: string; createdAt?: string }>>
  generatedFilesDelete(id: string): Promise<void>
  generatedFilesClear(): Promise<void>
}