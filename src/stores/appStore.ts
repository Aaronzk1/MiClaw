import { create } from 'zustand'

const MAX_DEBUG_LOGS = 100

interface AppState {
  currentPage: string
  setPage: (page: string) => void
  conversations: any[]
  setConversations: (c: any[]) => void
  currentConvId: string | null
  setCurrentConvId: (id: string | null) => void
  messages: any[]
  setMessages: (m: any[]) => void
  addMessage: (m: any) => void
  updateLastMessage: (patch: any) => void
  isStreaming: boolean
  setStreaming: (s: boolean) => void
  streamingMsgId: string | null
  streamBuf: string
  setStreamBuf: (s: string) => void
  appendToken: (t: string) => void
  thinkBuf: string
  setThinkBuf: (s: string) => void
  appendThink: (t: string) => void
  toolCalls: any[]
  addToolCall: (tc: any) => void
  processingStartTime: number | null
  resetStream: () => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  rightPanelVisible: boolean
  toggleRightPanel: () => void
  gatewayRunning: boolean
  setGatewayRunning: (r: boolean) => void
  tokenUsage: number
  setTokenUsage: (n: number) => void
  lastUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null
  setLastUsage: (u: any) => void
  lastModel: string | null
  setLastModel: (m: string) => void
  sessionTokens: number
  addSessionTokens: (n: number) => void
  resetSessionTokens: () => void
  debugLogs: { t: string; level: string; msg: string }[]
  addDebugLog: (level: string, msg: string) => void
  clearDebugLogs: () => void
  config: any
  setConfig: (c: any) => void
  agents: any[]
  setAgents: (a: any[]) => void
  models: any[]
  setModels: (m: any[]) => void
  currentAgent: any
  setCurrentAgent: (a: any) => void
  compareMode: boolean
  setCompareMode: (v: boolean) => void
  compareConvId: string | null
  setCompareConvId: (id: string | null) => void
  chatMaxMode: boolean
  toggleChatMaxMode: () => void
  chatGoalJudgeEnabled: boolean
  toggleChatGoalJudge: () => void
  streamSpeed: { chars: number; elapsed: number; cps: number } | null
  setStreamSpeed: (s: { chars: number; elapsed: number; cps: number } | null) => void
  speedHistory: Array<{ time: number; cps: number }>
  appendSpeedHistory: (p: { time: number; cps: number }) => void
  resetSpeedHistory: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'chat',
  setPage: (page) => set({ currentPage: page }),
  conversations: [],
  setConversations: (c) => set({ conversations: c }),
  currentConvId: null,
  setCurrentConvId: (id) => set({ currentConvId: id }),
  messages: [],
  setMessages: (m) => set({ messages: m }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateLastMessage: (patch) => set((s) => {
    const msgs = s.messages
    if (msgs.length === 0) return s
    const last = msgs[msgs.length - 1]
    return { messages: [...msgs.slice(0, -1), { ...last, ...patch }] }
  }),
  isStreaming: false,
  setStreaming: (s) => set((prev) => ({
    isStreaming: s,
    processingStartTime: s ? Date.now() : null,
    ...(s ? {} : { streamBuf: '', thinkBuf: '', toolCalls: [] }),
  })),
  streamingMsgId: null as string | null,
  streamBuf: '',
  setStreamBuf: (s) => set({ streamBuf: s }),
  appendToken: (t) => set((s) => ({ streamBuf: s.streamBuf + t })),
  thinkBuf: '',
  setThinkBuf: (s) => set({ thinkBuf: s }),
  appendThink: (t) => set((s) => ({ thinkBuf: s.thinkBuf + t })),
  toolCalls: [],
  addToolCall: (tc) => set((s) => {
    const idx = s.toolCalls.findIndex((t: any) => t.id === tc.id || (tc.name && t.name === tc.name && t.status === 'running'))
    if (idx >= 0) {
      const updated = [...s.toolCalls]
      updated[idx] = { ...updated[idx], ...tc }
      return { toolCalls: updated }
    }
    return { toolCalls: [...s.toolCalls, { ...tc, status: tc.status || 'running' }] }
  }),
  processingStartTime: null as number | null,
  resetStream: () => set({ streamBuf: '', thinkBuf: '', toolCalls: [] }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  rightPanelVisible: true,
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  gatewayRunning: false,
  setGatewayRunning: (r) => set({ gatewayRunning: r }),
  tokenUsage: 0,
  setTokenUsage: (n) => set({ tokenUsage: n }),
  lastUsage: null,
  setLastUsage: (u) => set({ lastUsage: u }),
  lastModel: null,
  setLastModel: (m) => set({ lastModel: m }),
  sessionTokens: 0,
  addSessionTokens: (n) => set((s) => ({ sessionTokens: s.sessionTokens + n })),
  resetSessionTokens: () => set({ sessionTokens: 0 }),
  debugLogs: [],
  addDebugLog: (level, msg) => set((s) => ({
    debugLogs: [...s.debugLogs.slice(-(MAX_DEBUG_LOGS - 1)), { t: new Date().toLocaleTimeString(), level, msg }]
  })),
  clearDebugLogs: () => set({ debugLogs: [] }),
  config: {},
  setConfig: (c) => set({ config: c }),
  agents: [],
  setAgents: (a) => set({ agents: a }),
  models: [],
  setModels: (m) => set({ models: m }),
  currentAgent: null,
  setCurrentAgent: (a) => set({ currentAgent: a }),
  compareMode: false,
  setCompareMode: (v) => set({ compareMode: v, compareConvId: v ? null : undefined }),
  compareConvId: null,
  setCompareConvId: (id) => set({ compareConvId: id }),
  chatMaxMode: false,
  toggleChatMaxMode: () => set((s) => ({ chatMaxMode: !s.chatMaxMode })),
  chatGoalJudgeEnabled: false,
  toggleChatGoalJudge: () => set((s) => ({ chatGoalJudgeEnabled: !s.chatGoalJudgeEnabled })),
  streamSpeed: null,
  setStreamSpeed: (s) => set({ streamSpeed: s }),
  speedHistory: [],
  appendSpeedHistory: (p) => set((s) => {
    const next = [...s.speedHistory, p]
    return { speedHistory: next.length > 60 ? next.slice(-60) : next }
  }),
  resetSpeedHistory: () => set({ speedHistory: [] }),
}))
