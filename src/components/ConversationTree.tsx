import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

interface TreeNode {
  id: string
  title: string
  parentConvId?: string
  forkPoint?: number
  children: TreeNode[]
  x: number
  y: number
  width: number
  height: number
}

const NODE_W = 180
const NODE_H = 48
const H_GAP = 24
const V_GAP = 72
const PADDING = 24

function truncate(s: string, max: number): string {
  if (!s) return '新建对话'
  return s.length > max ? s.slice(0, max) + '...' : s
}

function buildTree(convs: any[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const c of convs) {
    map.set(c.id, { ...c, children: [], x: 0, y: 0, width: NODE_W, height: NODE_H })
  }
  const roots: TreeNode[] = []
  for (const node of map.values()) {
    if (node.parentConvId && map.has(node.parentConvId)) {
      map.get(node.parentConvId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function layoutTree(roots: TreeNode[]): { nodes: TreeNode[]; totalW: number; totalH: number } {
  const allNodes: TreeNode[] = []
  let globalX = PADDING

  function layoutSubtree(node: TreeNode, depth: number): number {
    const y = PADDING + depth * (NODE_H + V_GAP)
    if (node.children.length === 0) {
      node.x = globalX
      node.y = y
      allNodes.push(node)
      globalX += NODE_W + H_GAP
      return NODE_W
    }
    let totalChildW = 0
    for (let i = 0; i < node.children.length; i++) {
      const w = layoutSubtree(node.children[i], depth + 1)
      totalChildW += w + (i > 0 ? H_GAP : 0)
    }
    const subtreeW = Math.max(NODE_W, totalChildW)
    node.x = globalX + (subtreeW - NODE_W) / 2
    node.y = y
    allNodes.push(node)
    globalX += subtreeW + H_GAP
    return subtreeW
  }

  for (const root of roots) {
    layoutSubtree(root, 0)
  }

  let maxX = 0
  let maxY = 0
  for (const n of allNodes) {
    maxX = Math.max(maxX, n.x + NODE_W + PADDING)
    maxY = Math.max(maxY, n.y + NODE_H + PADDING)
  }
  return { nodes: allNodes, totalW: maxX, totalH: maxY }
}

function getEdges(nodes: TreeNode[]): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (const node of nodes) {
    for (const child of node.children) {
      edges.push({
        x1: node.x + NODE_W / 2,
        y1: node.y + NODE_H,
        x2: child.x + NODE_W / 2,
        y2: child.y,
      })
    }
  }
  return edges
}

export function ConversationTree() {
  const conversations = useAppStore(s => s.conversations)
  const currentConvId = useAppStore(s => s.currentConvId)
  const setCurrentConvId = useAppStore(s => s.setCurrentConvId)
  const setMessages = useAppStore(s => s.setMessages)
  const setPage = useAppStore(s => s.setPage)
  const [convs, setConvs] = useState<any[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.convList().then(setConvs).catch(() => {})
  }, [])

  const treeRoots = useMemo(() => buildTree(convs), [convs])
  const { nodes, totalW, totalH } = useMemo(() => layoutTree(treeRoots), [treeRoots])
  const edges = useMemo(() => getEdges(nodes), [nodes])
  const hasForks = convs.some((c: any) => c.parentConvId)

  const handleClick = useCallback((id: string) => {
    setCurrentConvId(id)
    api.convMessages(id).then(setMessages).catch(() => {})
    setPage('chat')
  }, [setCurrentConvId, setMessages, setPage])

  if (convs.length === 0) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text4)', fontSize: 13 }}>暂无对话</div>
  }

  if (!hasForks) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text4)', fontSize: 13 }}>暂无分叉对话</div>
  }

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'auto', background: 'var(--bg2, var(--bg))', borderRadius: 8, border: '1px solid var(--border)' }}>
      <svg width={totalW} height={totalH} style={{ display: 'block' }}>
        {/* Edges */}
        {edges.map((e, i) => {
          const midY = (e.y1 + e.y2) / 2
          return (
            <path
              key={i}
              d={`M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`}
              fill="none"
              stroke="var(--border)"
              strokeWidth={2}
            />
          )
        })}
        {/* Nodes */}
        {nodes.map(node => {
          const isActive = node.id === currentConvId
          return (
            <g
              key={node.id}
              onClick={() => handleClick(node.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                ry={8}
                fill={isActive ? 'var(--accent-light, #eef2ff)' : 'var(--bg, #fff)'}
                stroke={isActive ? 'var(--accent)' : 'var(--border)'}
                strokeWidth={isActive ? 2 : 1}
              />
              <text
                x={node.x + NODE_W / 2}
                y={node.y + 20}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="var(--text)"
              >
                {truncate(node.title, 12)}
              </text>
              {node.forkPoint !== undefined && (
                <text
                  x={node.x + NODE_W / 2}
                  y={node.y + 36}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--text4)"
                >
                  {`分叉点 #${node.forkPoint + 1}`}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
