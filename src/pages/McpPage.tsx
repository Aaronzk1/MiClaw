import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import type { McpServer } from '../types/ipc-api'

function ServerModal({ server, onSave, onClose }: {
  server?: McpServer | null
  onSave: (data: any) => void
  onClose: () => void
}) {
  const isEdit = !!server
  const [id, setId] = useState(server?.id || '')
  const [name, setName] = useState(server?.name || '')
  const [transport, setTransport] = useState(server?.transport || (server?.command ? 'stdio' : 'http'))
  const [command, setCommand] = useState(server?.command || '')
  const [args, setArgs] = useState(server?.args?.join(' ') || '')
  const [url, setUrl] = useState(server?.url || '')
  const [cwd, setCwd] = useState(server?.cwd || '')
  const [envStr, setEnvStr] = useState(
    server?.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  )
  const [enabled, setEnabled] = useState(server?.enabled !== false)
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!id.trim()) { setError('请输入 ID'); return }
    if (transport === 'stdio' && !command.trim()) { setError('Stdio 模式需要填写启动命令'); return }
    if (transport === 'http' && !url.trim()) { setError('HTTP 模式需要填写 URL'); return }

    const env: Record<string, string> = {}
    for (const line of envStr.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.includes('=')) continue
      const [k, ...rest] = trimmed.split('=')
      env[k.trim()] = rest.join('=').trim()
    }

    onSave({
      id: id.trim(),
      name: name.trim() || id.trim(),
      transport,
      command: transport === 'stdio' ? command.trim() : undefined,
      args: transport === 'stdio' && args.trim() ? args.trim().split(/\s+/) : undefined,
      url: transport === 'http' ? url.trim() : undefined,
      cwd: cwd.trim() || undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      enabled,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 520, maxWidth: 600 }}>
        <div className="modal-header">
          <h3>{isEdit ? '编辑 MCP Server' : '添加 MCP Server'}</h3>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ color: 'var(--error)', fontSize: 12, padding: '6px 10px', background: 'rgba(220,38,38,0.06)', borderRadius: 'var(--radius)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>ID *</span>
              <input value={id} onChange={e => setId(e.target.value)} disabled={isEdit}
                placeholder="例如 my-mcp-server"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: isEdit ? 'var(--bg3)' : 'var(--bg)', fontFamily: 'var(--mono)' }} />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>名称</span>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="显示名称"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }} />
            </label>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>传输方式</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['stdio', 'http'] as const).map(t => (
                <button key={t} onClick={() => setTransport(t)}
                  style={{
                    padding: '6px 16px', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600,
                    border: `1px solid ${transport === t ? 'var(--accent)' : 'var(--border)'}`,
                    background: transport === t ? 'var(--accent-light)' : 'var(--bg)',
                    color: transport === t ? 'var(--accent)' : 'var(--text3)',
                    cursor: 'pointer', fontFamily: 'var(--font)',
                  }}>
                  {t === 'stdio' ? 'Stdio (本地进程)' : 'HTTP (远程)'}
                </button>
              ))}
            </div>
          </div>

          {transport === 'stdio' ? (
            <>
              <label>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>启动命令 *</span>
                <input value={command} onChange={e => setCommand(e.target.value)}
                  placeholder="例如 npx -y @modelcontextprotocol/server-filesystem"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, fontFamily: 'var(--mono)' }} />
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>参数</span>
                <input value={args} onChange={e => setArgs(e.target.value)}
                  placeholder="例如 /path/to/dir --verbose"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, fontFamily: 'var(--mono)' }} />
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>工作目录</span>
                <input value={cwd} onChange={e => setCwd(e.target.value)}
                  placeholder="可选"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }} />
              </label>
            </>
          ) : (
            <>
              <label>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>URL *</span>
                <input value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="http://localhost:3000/sse"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, fontFamily: 'var(--mono)' }} />
              </label>
            </>
          )}

          <label>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>环境变量</span>
            <textarea value={envStr} onChange={e => setEnvStr(e.target.value)} rows={3}
              placeholder={"KEY=value\nANOTHER_KEY=value"}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, fontFamily: 'var(--mono)', resize: 'vertical' }} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>启用</span>
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  )
}

export function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editServer, setEditServer] = useState<McpServer | null>(null)
  const [probeResults, setProbeResults] = useState<Record<string, { ok: boolean; tools?: any[]; error?: string }>>({})
  const [probing, setProbing] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const load = () => api.mcpList().then(setServers).catch(console.error)

  useEffect(() => { load() }, [])

  const handleSave = async (data: any) => {
    const result = await api.mcpSave(data)
    if (result.ok) {
      setShowModal(false)
      setEditServer(null)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 5000)
      load()
    }
  }

  const handleDelete = async (id: string) => {
    const result = await api.mcpDelete(id)
    if (result.ok) load()
    setDeleteConfirm(null)
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.mcpToggle(id, enabled)
    load()
  }

  const handleProbe = async (id: string) => {
    setProbing(prev => new Set(prev).add(id))
    const result = await api.mcpProbe(id)
    setProbeResults(prev => ({ ...prev, [id]: result }))
    setProbing(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const enabledCount = servers.filter(s => s.enabled).length

  return (
    <div style={{ padding: '20px 24px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>MCP Servers</h2>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>
            {servers.length} 个服务, {enabledCount} 个已启用
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditServer(null); setShowModal(true) }}>
          + 添加 Server
        </button>
      </div>

      {justSaved && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius)',
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)',
          fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>&#9888;</span>
          MCP 配置已保存，请<strong>开启新对话</strong>后生效。
        </div>
      )}

      {servers.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', color: 'var(--text4)',
          border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#128268;</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>暂无 MCP Server</div>
          <div style={{ fontSize: 13 }}>添加 MCP server 以扩展 Agent 的工具能力。</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {servers.map(s => {
            const probe = probeResults[s.id]
            const isProbing = probing.has(s.id)
            return (
              <div key={s.id} style={{
                padding: '14px 16px', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: s.enabled ? 'var(--bg)' : 'var(--bg3)',
                opacity: s.enabled ? 1 : 0.6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: probe?.ok ? 'var(--success)' : probe?.ok === false ? 'var(--error)' : 'var(--text4)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>{s.name || s.id}</span>
                      <span style={{ fontSize: 11, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>{s.id}</span>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 8,
                        background: s.transport === 'stdio' ? 'var(--accent-light)' : 'var(--success-light)',
                        color: s.transport === 'stdio' ? 'var(--accent)' : 'var(--success)',
                      }}>{s.transport === 'stdio' ? 'Stdio' : 'HTTP'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                      {s.transport === 'stdio'
                        ? `${s.command} ${(s.args || []).join(' ')}`
                        : s.url || '未配置 URL'}
                    </div>
                    {probe?.tools && probe.tools.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {probe.tools.slice(0, 8).map((t: any, i: number) => (
                          <span key={i} style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 6,
                            background: 'var(--accent-light)', color: 'var(--accent)',
                          }}>
                            {t.name || t}
                          </span>
                        ))}
                        {probe.tools.length > 8 && (
                          <span style={{ fontSize: 10, color: 'var(--text4)' }}>+{probe.tools.length - 8} 个工具</span>
                        )}
                      </div>
                    )}
                    {probe?.error && (
                      <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>{probe.error}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleProbe(s.id)}
                      disabled={isProbing}
                      style={{
                        border: 'none', background: 'var(--bg3)', color: 'var(--text3)',
                        padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                        fontFamily: 'var(--font)',
                      }}
                    >
                      {isProbing ? '测试中...' : '测试连接'}
                    </button>
                    <button
                      onClick={() => { setEditServer(s); setShowModal(true) }}
                      style={{
                        border: 'none', background: 'var(--bg3)', color: 'var(--text3)',
                        padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                        fontFamily: 'var(--font)',
                      }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(s.id)}
                      style={{
                        border: 'none', background: 'var(--bg3)', color: 'var(--error)',
                        padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                        fontFamily: 'var(--font)',
                      }}
                    >
                      删除
                    </button>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={e => handleToggle(s.id, e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <ServerModal
          server={editServer}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditServer(null) }}
        />
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 360 }}>
            <div className="modal-header"><h3>删除 MCP Server</h3></div>
            <div className="modal-body">
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>
                确定删除 <strong>{deleteConfirm}</strong>？此操作不可撤销。
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>取消</button>
              <button className="btn btn-primary" style={{ background: 'var(--error)' }} onClick={() => handleDelete(deleteConfirm)}>删除</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--bg3)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>
        <strong>提示：</strong>此处配置的 MCP server 对所有 Agent 生效。配置变更需<strong>开启新对话</strong>后才会生效。支持 Stdio（本地进程）和 HTTP（远程）两种传输方式。
      </div>
    </div>
  )
}
