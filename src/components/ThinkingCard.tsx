import { useState, useEffect, useRef, useCallback } from 'react'

interface ThinkingCardProps {
  content: string
  isStreaming?: boolean
}

export function ThinkingCard({ content, isStreaming = false }: ThinkingCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [copied, setCopied] = useState(false)
  const wasStreaming = useRef(isStreaming)

  // Auto-expand when streaming starts, stay expanded when it ends
  useEffect(() => {
    if (isStreaming && !wasStreaming.current) {
      setIsExpanded(true)
    }
    wasStreaming.current = isStreaming
  }, [isStreaming])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }, [content])

  if (!content) return null

  const charCount = content.length
  const countStr = charCount >= 1000
    ? `${(charCount / 1000).toFixed(1)}k`
    : String(charCount)

  return (
    <div className="thinking-card">
      <div
        className="thinking-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="thinking-icon-wrapper">
          <span className="thinking-icon">💡</span>
          {isStreaming && <span className="thinking-pulse"></span>}
        </div>
        <span className="thinking-title">
          {isStreaming ? '思考中...' : `思考过程 (${countStr} 字符)`}
        </span>
        {!isStreaming && content && (
          <button
            className="action-btn"
            onClick={(e) => { e.stopPropagation(); handleCopy() }}
            title="复制思考内容"
            style={copied ? { color: 'var(--success)', fontSize: 11 } : { fontSize: 11 }}
          >
            {copied ? '已复制' : '⎘'}
          </button>
        )}
        <span className="thinking-toggle">
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>
      {isExpanded && (
        <div className="thinking-content" style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflowY: 'auto' }}>
          {content}
        </div>
      )}
    </div>
  )
}
