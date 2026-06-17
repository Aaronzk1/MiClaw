import { useEffect, useState, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { toast } from '../components/Toast'

interface CompareResult {
  text: string
  thinking: string
  toolCalls: any[]
  ok: boolean
  error?: string
  loading: boolean
}

function ResultPanel({ side, modelId, result }: { side: 'left' | 'right'; modelId: string; result: CompareResult }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [result.text, result.thinking])

  const color = side === 'left' ? 'var(--accent)' : 'var(--success)'

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
      borderLeft: side === 'right' ? '1px solid var(--border)' : undefined,
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#fff', background: color,
          width: 20, height: 20, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{side === 'left' ? 'A' : 'B'}</span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{modelId || '未选择模型'}</span>
        {result.ok && result.text && (
          <span style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 'auto' }}>
            {result.text.length} 字符
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {result.loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
            <span className="tool-spinner" />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>等待响应...</span>
          </div>
        ) : result.error ? (
          <div style={{ color: 'var(--error)', fontSize: 12, padding: 12 }}>
            错误: {result.error}
          </div>
        ) : result.text ? (
          <div>
            {/* Thinking */}
            {result.thinking && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', userSelect: 'none' }}>
                  思考过程 ({result.thinking.length} 字符)
                </summary>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 6, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6 }}>
                  {result.thinking}
                </div>
              </details>
            )}
            {/* Tool calls */}
            {result.toolCalls.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {result.toolCalls.map((tc: any, i: number) => (
                  <span key={i} style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: 'var(--accent-light)', color: 'var(--accent)',
                  }}>
                    {tc.function?.name || tc.name || 'tool'}
                  </span>
                ))}
              </div>
            )}
            {/* Response */}
            <div style={{ fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {result.text}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text4)', fontSize: 13 }}>
            输入消息后点击对比
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}

export function ComparePage() {
  const setCompareMode = useAppStore(s => s.setCompareMode)
  const models = useAppStore(s => s.models)
  const [input, setInput] = useState('')
  const [leftModel, setLeftModel] = useState('')
  const [rightModel, setRightModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [leftResult, setLeftResult] = useState<CompareResult>({ text: '', thinking: '', toolCalls: [], ok: true, loading: false })
  const [rightResult, setRightResult] = useState<CompareResult>({ text: '', thinking: '', toolCalls: [], ok: true, loading: false })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const enabledModels = models.filter((m: any) => m.enabled !== false)

  useEffect(() => {
    if (enabledModels.length >= 2 && !leftModel && !rightModel) {
      setLeftModel(enabledModels[0].id)
      setRightModel(enabledModels[1].id)
    } else if (enabledModels.length >= 1 && !leftModel) {
      setLeftModel(enabledModels[0].id)
    }
  }, [enabledModels])

  // Listen for streaming tokens
  useEffect(() => {
    api.onCompareToken((d) => {
      const setter = d.modelId === leftModel ? setLeftResult : d.modelId === rightModel ? setRightResult : null
      if (setter) setter(prev => ({ ...prev, text: prev.text + d.token, loading: false }))
    })
    api.onCompareThinking((d) => {
      const setter = d.modelId === leftModel ? setLeftResult : d.modelId === rightModel ? setRightResult : null
      if (setter) setter(prev => ({ ...prev, thinking: (prev.thinking || '') + d.token }))
    })
    api.onCompareToolStatus((d) => {
      const setter = d.modelId === leftModel ? setLeftResult : d.modelId === rightModel ? setRightResult : null
      if (setter) setter(prev => ({ ...prev, toolCalls: [...prev.toolCalls, { id: d.id, name: d.name, status: d.status }] }))
    })
    api.onCompareResult((d) => {
      const setter = d.modelId === leftModel ? setLeftResult : d.modelId === rightModel ? setRightResult : null
      if (setter) setter({
        text: d.text || '', thinking: d.thinking || '', toolCalls: d.toolCalls || [],
        ok: d.ok, error: d.error, loading: false,
      })
    })
  }, [leftModel, rightModel])

  const handleCompare = useCallback(async () => {
    if (!input.trim()) { toast('请输入消息', 'info'); return }
    if (!leftModel || !rightModel) { toast('请选择两个模型', 'info'); return }
    if (leftModel === rightModel) { toast('请选择不同的模型', 'info'); return }

    setLoading(true)
    setLeftResult({ text: '', thinking: '', toolCalls: [], ok: true, loading: true })
    setRightResult({ text: '', thinking: '', toolCalls: [], ok: true, loading: true })

    try {
      const resp = await api.chatCompare({ message: input, modelIds: [leftModel, rightModel] })
      if (!resp?.ok) {
        const firstErr = resp?.results?.find((r: any) => r.error)?.error
        toast(firstErr || '对比失败', 'error')
        setLeftResult(prev => ({ ...prev, loading: false }))
        setRightResult(prev => ({ ...prev, loading: false }))
      }
      // Results come via onCompareResult events
    } catch (e: any) {
      toast(e?.message || '请求失败', 'error')
      setLeftResult(prev => ({ ...prev, loading: false }))
      setRightResult(prev => ({ ...prev, loading: false }))
    }
    setLoading(false)
  }, [input, leftModel, rightModel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCompare()
    }
  }

  const swap = () => {
    setLeftModel(rightModel)
    setRightModel(leftModel)
    const tmp = leftResult
    setLeftResult(rightResult)
    setRightResult(tmp)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>模型对比</span>
        <span style={{ fontSize: 11, color: 'var(--text4)' }}>同一条消息发给不同模型，对比回答</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-secondary" onClick={() => setCompareMode(false)}>退出对比</button>
      </div>

      {/* Model selectors */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--bg2)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--accent)', width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</span>
        <select value={leftModel} onChange={e => setLeftModel(e.target.value)} style={selectStyle}>
          <option value="">选择模型...</option>
          {enabledModels.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
        </select>

        <button onClick={swap} style={{
          border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14,
          color: 'var(--text3)', padding: '2px 6px', borderRadius: 4,
        }} title="交换">⇄</button>

        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--success)', width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>B</span>
        <select value={rightModel} onChange={e => setRightModel(e.target.value)} style={selectStyle}>
          <option value="">选择模型...</option>
          {enabledModels.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
        </select>
      </div>

      {/* Results */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ResultPanel side="left" modelId={leftModel} result={leftResult} />
        <ResultPanel side="right" modelId={rightModel} result={rightResult} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 10, alignItems: 'flex-end', background: 'var(--bg)',
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入要对比的问题... (Enter 发送)"
          style={{
            flex: 1, resize: 'none', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '10px 14px', fontSize: 14,
            outline: 'none', minHeight: 40, maxHeight: 100, fontFamily: 'var(--font)',
            color: 'var(--text)', lineHeight: 1.5, background: 'var(--bg2)',
            overflowX: 'hidden', wordBreak: 'break-word',
          }}
        />
        <button
          className="send-btn"
          onClick={handleCompare}
          disabled={loading || !input.trim()}
        >
          {loading ? '⏳' : '⇄'}
        </button>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '4px 8px', fontSize: 12,
  border: '1px solid var(--border)', borderRadius: 4,
  background: 'var(--bg)', color: 'var(--text)',
  fontFamily: 'var(--font)', outline: 'none',
}
