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
  appendToken: (t: string) => void
  thinkBuf: string
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
  tokenUsage: number
  setTokenUsage: (n: number) => void
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
  appendToken: (t) => set((s) => ({ streamBuf: s.streamBuf + t })),
  thinkBuf: '',
  appendThink: (t) => set((s) => ({ thinkBuf: s.thinkBuf + t })),
  toolCalls: [],
  addToolCall: (tc) => set((s) => ({ toolCalls: [...s.toolCalls, { ...tc, status: 'running' }] })),
  resetStream: () => set({ streamBuf: '', thinkBuf: '', toolCalls: [], isStreaming: false }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  rightPanelVisible: true,
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  gatewayRunning: false,
  setGatewayRunning: (r) => set({ gatewayRunning: r }),
  tokenUsage: 0,
  setTokenUsage: (n) => set({ tokenUsage: n }),
}))
