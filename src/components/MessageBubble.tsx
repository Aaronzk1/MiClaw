import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

import { ThinkingCard } from './ThinkingCard'
import { ToolCallCard } from './ToolCallCard'
import { ToolWaterfall } from './ToolWaterfall'
import { healMarkdown } from '../lib/healMarkdown'

const mdPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex, rehypeHighlight]

/** Memoized markdown — applies healMarkdown during streaming to fix incomplete syntax */
const MemoizedMarkdown = memo(function MemoizedMarkdown({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const healed = isStreaming ? healMarkdown(content) : content
  return (
    <ReactMarkdown remarkPlugins={mdPlugins} rehypePlugins={rehypePlugins} components={{ code: CodeBlock }}>
      {healed}
    </ReactMarkdown>
  )
})

function ErrorCard({ content }: { content: string }) {
  const [showRaw, setShowRaw] = useState(false)
  // Extract raw error from the friendly message if it contains technical details
  const rawMatch = content.match(/(?:错误|Error|error)[:：]\s*(.+)/i)
  const hasRaw = rawMatch || content.length > 120

  return (
    <div style={{
      background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
      borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ color: 'var(--error)', fontSize: 15, flexShrink: 0, marginTop: 1 }}>!</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--error)', fontWeight: 500 }}>{content}</div>
          {hasRaw && (
            <button
              onClick={() => setShowRaw(!showRaw)}
              style={{ background: 'none', border: 'none', color: 'var(--text4)', fontSize: 11, cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' }}
            >
              {showRaw ? '收起详情' : '查看详情'}
            </button>
          )}
          {showRaw && rawMatch && (
            <pre style={{
              margin: '6px 0 0', padding: '8px 10px', borderRadius: 4,
              background: 'var(--bg)', border: '1px solid var(--border)',
              fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 150, overflow: 'auto',
            }}>{rawMatch[1]}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  model?: string
  tokens?: number
  toolCalls?: Array<{
    id: string
    name: string
    args?: string
    output?: string
    status: 'running' | 'done' | 'error'
  }>
  isStreaming?: boolean
  fadeIn?: boolean
  isError?: boolean
  onCopy?: () => void
  onRegenerate?: () => void
  onEdit?: () => void
  onReplyQuote?: () => void
  onFork?: () => void
}

function ProcessingIndicator() {
  const processingStartTime = useAppStore(s => s.processingStartTime)
  const thinkBuf = useAppStore(s => s.thinkBuf)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!processingStartTime) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - processingStartTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [processingStartTime])

  const fmtTime = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`
  const hasThinking = thinkBuf && thinkBuf.length > 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text3)', fontSize: 13, padding: '8px 0' }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)',
        animation: 'pulse 1.4s ease infinite', flexShrink: 0,
      }} />
      <span>
        {hasThinking ? 'Agent 正在处理' : 'Gateway 处理中'}
        {elapsed > 0 && <span style={{ color: 'var(--text4)', marginLeft: 6 }}>({fmtTime(elapsed)})</span>}
      </span>
    </div>
  )
}

function CodeBlock({ children, className, ...props }: any) {
  const match = /language-(\w+)/.exec(className || '')
  const lang = match?.[1]
  const [expanded, setExpanded] = useState(false)
  const code = (children as any)?.props?.children
  const codeStr = typeof code === 'string' ? code : String(code || '')

  if (lang) {
    return (
      <>
        <div className="code-block-wrapper">
          <div className="code-block-header">
            <span className="code-block-language">{lang}</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="code-block-copy" onClick={() => { if (codeStr) navigator.clipboard.writeText(codeStr) }}>复制</button>
              <button className="code-block-copy" onClick={() => setExpanded(true)}>全屏</button>
              <button className="code-block-copy" onClick={() => {
                if (!codeStr) return
                const blob = new Blob([codeStr], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `code.${lang}`; a.click(); URL.revokeObjectURL(url)
              }}>下载</button>
            </div>
          </div>
          <pre className="code-block-pre"><code className={className} {...props}>{children}</code></pre>
        </div>
        {expanded && (
          <div className="modal-overlay" onClick={() => setExpanded(false)} style={{ zIndex: 9999 }}>
            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 16, background: 'var(--bg)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div className="code-block-header">
                <span className="code-block-language">{lang}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button className="code-block-copy" onClick={() => { if (codeStr) navigator.clipboard.writeText(codeStr) }}>复制</button>
                  <button className="code-block-copy" onClick={() => {
                    if (!codeStr) return
                    const blob = new Blob([codeStr], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a'); a.href = url; a.download = `code.${lang}`; a.click(); URL.revokeObjectURL(url)
                  }}>下载</button>
                  <button className="code-block-copy" onClick={() => setExpanded(false)}>关闭</button>
                </div>
              </div>
              <pre style={{ flex: 1, margin: 0, padding: '14px 16px', fontSize: 14, fontFamily: 'var(--mono)', lineHeight: 1.6, overflow: 'auto', background: 'var(--bg)' }}><code className={className} {...props}>{children}</code></pre>
            </div>
          </div>
        )}
      </>
    )
  }
  return <code className={className} {...props}>{children}</code>
}

function ToolCallsGroup({ toolCalls, isStreaming }: { toolCalls: any[]; isStreaming?: boolean }) {
  const [viewMode, setViewMode] = useState<'cards' | 'waterfall'>('cards')
  const running = toolCalls.filter(t => t.status === 'running').length
  const done = toolCalls.filter(t => t.status === 'done' || !t.status).length
  const errors = toolCalls.filter(t => t.status === 'error').length
  const showToggle = toolCalls.length >= 2

  return (
    <div className="tool-calls-strip">
      <div className="tool-calls-header">
        <span className="tool-calls-count">
          {running > 0
            ? `${running} 个工具执行中`
            : `${done + errors} 个工具${errors > 0 ? ` (${errors} 失败)` : ''}`}
        </span>
        {showToggle && (
          <div className="wf-toggle">
            <button className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')}>卡片</button>
            <button className={viewMode === 'waterfall' ? 'active' : ''} onClick={() => setViewMode('waterfall')}>瀑布图</button>
          </div>
        )}
      </div>
      {viewMode === 'waterfall' ? (
        <ToolWaterfall toolCalls={toolCalls.filter(tc => tc && tc.id).map(tc => ({
          id: tc.id,
          name: tc.name || tc.function?.name || 'unknown',
          args: tc.args || tc.function?.arguments,
          output: tc.output,
          status: isStreaming ? (tc.status || 'running') : (tc.status || 'done'),
        }))} />
      ) : (
        <div className="tool-calls-scroll">
          {toolCalls.filter(tc => tc && tc.id).map((tc) => (
            <ToolCallCard
              key={tc.id}
              name={tc.name || tc.function?.name || 'unknown'}
              args={tc.args || tc.function?.arguments}
              output={tc.output}
              status={isStreaming ? (tc.status || 'running') : (tc.status || 'done')}
              isStreaming={isStreaming}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const MessageBubble = memo(function MessageBubble({
  role,
  content,
  thinking,
  model,
  tokens,
  toolCalls,
  isStreaming = false,
  fadeIn = false,
  isError = false,
  onCopy,
  onRegenerate,
  onEdit,
  onReplyQuote,
  onFork,
}: MessageBubbleProps) {
  const [justFinished, setJustFinished] = useState(false)
  const [copied, setCopied] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const wasStreaming = useRef(isStreaming)

  useEffect(() => {
    if (wasStreaming.current && !isStreaming) {
      setJustFinished(true)
      const timer = setTimeout(() => setJustFinished(false), 350)
      return () => clearTimeout(timer)
    }
    wasStreaming.current = isStreaming
  }, [isStreaming])

  const handleCopy = useCallback(() => {
    const doCopy = async (text: string) => {
      try { await navigator.clipboard.writeText(text); return true } catch {}
      try {
        const ta = document.createElement('textarea')
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy')
        document.body.removeChild(ta); return true
      } catch { return false }
    }
    doCopy(content).then(ok => {
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    })
    onCopy?.()
  }, [content, onCopy])

  const handleSpeak = useCallback(() => {
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const text = content.replace(/[#*`>\[\]()!]/g, '').replace(/\n+/g, '. ')
    if (!text.trim()) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    utter.rate = 1
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utter)
    setSpeaking(true)
  }, [content, speaking])

  return (
    <div className={`message-bubble ${role}${isStreaming ? ' streaming' : ''}${fadeIn ? ' message-fade-in' : ''}${justFinished ? ' stream-finished' : ''}`}>
      <div className="message-avatar">
        {role === 'user' ? 'U' : 'AI'}
      </div>

      <div className="message-content-wrapper">
        {thinking && (
          <ThinkingCard content={thinking} isStreaming={isStreaming} />
        )}

        {toolCalls && toolCalls.length > 0 && (
          <ToolCallsGroup toolCalls={toolCalls} isStreaming={isStreaming} />
        )}

        <div className="message-bubble-content">
          {content ? (
            isError ? (
              <ErrorCard content={content} />
            ) : (
              <div className="streaming-render">
                <MemoizedMarkdown content={content} isStreaming={isStreaming} />
                {isStreaming && <span className="typing-cursor" />}
              </div>
            )
          ) : isStreaming ? (
            <ProcessingIndicator />
          ) : null}
        </div>

        {!isStreaming && (
          <div className="message-actions">
            {role === 'assistant' && tokens && tokens > 0 && (() => {
              const size = tokens < 100 ? 20 : tokens < 500 ? 24 : tokens < 2000 ? 30 : 36
              const color = tokens < 500 ? '#22c55e' : tokens < 2000 ? '#3b82f6' : '#f97316'
              const label = tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'k' : String(tokens)
              return (
                <span title={`${tokens} tokens`} style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: size, height: size, borderRadius: '50%',
                  background: color, color: '#fff', fontSize: size < 26 ? 9 : 10, fontWeight: 600,
                  fontFamily: 'var(--mono)', flexShrink: 0, lineHeight: 1,
                }}>
                  {label}
                </span>
              )
            })()}
            {role === 'assistant' && model && <span style={{ fontSize: 9, color: 'var(--text4)', padding: '0 4px', fontFamily: 'var(--mono)' }}>{model.split('/').pop()}</span>}
            <button className="action-btn" onClick={handleCopy} title="复制" style={copied ? { color: 'var(--success)', fontWeight: 600, fontSize: 11 } : undefined}>{copied ? '已复制' : '⎘'}</button>
            {onEdit && role === 'user' && <button className="action-btn" onClick={onEdit} title="编辑">✎</button>}
            {onReplyQuote && <button className="action-btn" onClick={onReplyQuote} title="引用回复">❝</button>}
            {onFork && <button className="action-btn" onClick={onFork} title="从此处分叉">⑂</button>}
            {onRegenerate && role === 'assistant' && <button className="action-btn" onClick={onRegenerate} title="重新生成">↻</button>}
            {role === 'assistant' && content && <button className="action-btn" onClick={handleSpeak} title={speaking ? '停止朗读' : '朗读'} style={speaking ? { color: 'var(--accent)' } : undefined}>{speaking ? '■' : '♪'}</button>}
          </div>
        )}
      </div>
    </div>
  )
})
