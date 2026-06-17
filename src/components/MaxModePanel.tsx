import { useState, useEffect, useRef } from 'react'

interface Proposal {
  id: number
  content: string
  thinking?: string
  temperature: number
  status: 'streaming' | 'done' | 'error'
  selected?: boolean
}

interface MaxModePanelProps {
  proposals: Proposal[]
  judgeResult?: number
  onPick: (id: number) => void
  isJudging?: boolean
}

const TEMP_LABELS: Record<number, string> = {
  0.3: '严谨',
  0.7: '均衡',
  1.1: '创意',
}

function ProposalModal({ proposal, onClose, onUse }: { proposal: Proposal; onClose: () => void; onUse: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', inset: 24,
          background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          border: '1px solid var(--border)', maxWidth: 800, maxHeight: 'calc(100vh - 48px)',
          margin: 'auto',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
              background: 'var(--accent-light)', color: 'var(--accent)',
            }}>
              {TEMP_LABELS[proposal.temperature] || `T${proposal.temperature}`}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>
              方案详情
            </span>
            <span style={{ fontSize: 11, color: 'var(--text4)' }}>
              {proposal.content.length} 字符
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { navigator.clipboard.writeText(proposal.content) }}
              style={{
                border: 'none', background: 'var(--bg3)', color: 'var(--text2)',
                padding: '5px 12px', borderRadius: 'var(--radius)', cursor: 'pointer',
                fontSize: 12, fontFamily: 'var(--font)',
              }}
            >
              复制
            </button>
            <button
              onClick={onUse}
              style={{
                border: 'none', background: 'var(--accent)', color: '#fff',
                padding: '5px 16px', borderRadius: 'var(--radius)', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
              }}
            >
              使用此方案
            </button>
            <button
              onClick={onClose}
              style={{
                border: 'none', background: 'var(--bg3)', color: 'var(--text3)',
                padding: '5px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
                fontSize: 14, fontFamily: 'var(--font)', lineHeight: 1,
              }}
            >
              X
            </button>
          </div>
        </div>

        {proposal.thinking && (
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)', maxHeight: 200, overflow: 'auto', flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>
              思考过程
            </div>
            <pre style={{
              margin: 0, fontSize: 12, color: 'var(--text3)', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font)',
            }}>
              {proposal.thinking}
            </pre>
          </div>
        )}

        <div style={{
          flex: 1, overflow: 'auto', padding: '16px',
        }}>
          <pre style={{
            margin: 0, fontSize: 13, color: 'var(--text1)', lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font)',
          }}>
            {proposal.content}
          </pre>
        </div>
      </div>
    </div>
  )
}

export function MaxModePanel({ proposals, judgeResult, onPick, isJudging }: MaxModePanelProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [modalId, setModalId] = useState<number | null>(null)
  const scrollRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const doneCount = proposals.filter(p => p.status === 'done').length
  const allDone = doneCount === proposals.length

  // Auto-scroll streaming proposals to bottom
  useEffect(() => {
    for (const p of proposals) {
      if (p.status === 'streaming') {
        const el = scrollRefs.current[p.id]
        if (el) el.scrollTop = el.scrollHeight
      }
    }
  }, [proposals])

  const modalProposal = modalId !== null ? proposals.find(p => p.id === modalId) : null

  return (
    <>
      <div className="dash-section" style={{ margin: '8px 0', padding: '12px 14px', background: 'var(--bg2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>MaxMode</span>
          <span style={{ fontSize: 11, color: 'var(--text4)' }}>
            {doneCount}/{proposals.length} 方案完成
          </span>
          {isJudging && (
            <span style={{ fontSize: 11, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', animation: 'pulse 1.4s ease infinite' }} />
              Judge 评估中...
            </span>
          )}
          {judgeResult !== undefined && !isJudging && (
            <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>已选出最优方案 (点击方案可查看完整内容)</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {proposals.map(p => {
            const isBest = judgeResult === p.id
            const isExpanded = expandedId === p.id
            const isStreaming = p.status === 'streaming'
            const charCount = p.content.length
            return (
              <div
                key={p.id}
                style={{
                  flex: 1, minWidth: 160, maxWidth: 300,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${isBest ? 'var(--success)' : isStreaming ? 'var(--accent)' : 'var(--border)'}`,
                  background: isBest ? 'rgba(22,163,74,0.06)' : 'var(--bg)',
                  cursor: p.status === 'done' ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                  opacity: p.status === 'error' ? 0.5 : 1,
                }}
              >
                <div
                  onClick={() => {
                    if (p.status === 'done') {
                      setExpandedId(isExpanded ? null : p.id)
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8,
                      background: isBest ? 'var(--success-light)' : 'var(--accent-light)',
                      color: isBest ? 'var(--success)' : 'var(--accent)',
                    }}>
                      {TEMP_LABELS[p.temperature] || `T${p.temperature}`}
                    </span>
                    {isBest && <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>最优</span>}
                    {isStreaming && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{charCount > 0 ? `${charCount} 字` : ''}</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.4s ease infinite' }} />
                      </span>
                    )}
                    {p.status === 'done' && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                        <span style={{ fontSize: 10, color: 'var(--text4)', fontVariantNumeric: 'tabular-nums' }}>{charCount} 字</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                      </span>
                    )}
                  </div>

                  <div
                    ref={el => { scrollRefs.current[p.id] = el }}
                    style={{
                      fontSize: 12, color: 'var(--text2)', lineHeight: 1.5,
                      maxHeight: isExpanded ? 200 : 80,
                      overflow: 'hidden',
                      transition: 'max-height 0.2s',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}
                  >
                    {p.content ? (
                      <>
                        {isExpanded ? p.content : p.content.slice(0, 200)}
                        {isStreaming && <span style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--accent)', marginLeft: 1, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />}
                      </>
                    ) : (
                      isStreaming ? (
                        <span style={{ color: 'var(--text4)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 12, height: 12, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          等待响应...
                        </span>
                      ) : p.status === 'error' ? '生成失败' : ''
                    )}
                  </div>
                </div>

                {p.status === 'done' && p.content && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setModalId(p.id) }}
                      style={{
                        flex: 1, border: 'none', background: 'var(--bg3)', color: 'var(--text2)',
                        padding: '4px 0', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                        fontFamily: 'var(--font)',
                      }}
                    >
                      查看完整
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onPick(p.id) }}
                      style={{
                        flex: 1, border: 'none',
                        background: isBest ? 'var(--success)' : 'var(--accent)',
                        color: '#fff',
                        padding: '4px 0', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                        fontFamily: 'var(--font)', fontWeight: 600,
                      }}
                    >
                      {isBest ? '已选用' : '选用'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {modalProposal && (
        <ProposalModal
          proposal={modalProposal}
          onClose={() => setModalId(null)}
          onUse={() => { onPick(modalProposal.id); setModalId(null) }}
        />
      )}
    </>
  )
}
