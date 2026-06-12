import { create } from 'zustand'

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
  isStreaming: boolean
  setStreaming: (s: boolean) => void
  streamBuf: string
  setStreamBuf: (s: string) => void
  appendToken: (t: string) => void
  thinkBuf: string
  setThinkBuf: (s: string) => void
  appendThink: (t: string) => void
  toolCalls: any[]
  addToolCall: (tc: any) => void
  resetStream: () => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  rightPanelVisible: boolean
  toggleRightPanel: () => void
  gatewayRunning: boolean
  setGatewayRunning: (r: boolean) => void
  gatewayPort: number
  setGatewayPort: (p: number) => void
  tokenUsage: number
  setTokenUsage: (n: number) => void
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
  generatedFiles: any[]
  addGeneratedFile: (f: any) => void
  clearGeneratedFiles: () => void
  memories: any[]
  setMemories: (m: any[]) => void
  addMemory: (m: any) => void
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
  isStreaming: false,
  setStreaming: (s) => set({ isStreaming: s }),
  streamBuf: '',
  setStreamBuf: (s) => set({ streamBuf: s }),
  appendToken: (t) => set((s) => ({ streamBuf: s.streamBuf + t })),
  thinkBuf: '',
  setThinkBuf: (s) => set({ thinkBuf: s }),
  appendThink: (t) => set((s) => ({ thinkBuf: s.thinkBuf + t })),
  toolCalls: [],
  addToolCall: (tc) => set((s) => {
    const idx = s.toolCalls.findIndex((t: any) => t.id === tc.id)
    if (idx >= 0) {
      const updated = [...s.toolCalls]
      updated[idx] = { ...updated[idx], ...tc }
      return { toolCalls: updated }
    }
    return { toolCalls: [...s.toolCalls, { ...tc, status: tc.status || 'running' }] }
  }),
  resetStream: () => set({ streamBuf: '', thinkBuf: '', toolCalls: [] }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  rightPanelVisible: true,
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  gatewayRunning: false,
  setGatewayRunning: (r) => set({ gatewayRunning: r }),
  gatewayPort: 18789,
  setGatewayPort: (p) => set({ gatewayPort: p }),
  tokenUsage: 0,
  setTokenUsage: (n) => set({ tokenUsage: n }),
  debugLogs: [],
  addDebugLog: (level, msg) => set((s) => ({
    debugLogs: [...s.debugLogs.slice(-99), { t: new Date().toLocaleTimeString(), level, msg }]
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
  generatedFiles: [],
  addGeneratedFile: (f) => set((s) => {
    if (s.generatedFiles.some((g: any) => g.path === f.path)) return s
    return { generatedFiles: [...s.generatedFiles, f] }
  }),
  clearGeneratedFiles: () => set({ generatedFiles: [] }),
  memories: [],
  setMemories: (m) => set({ memories: m }),
  addMemory: (m) => set((s) => ({ memories: [...s.memories, m] })),
}))
