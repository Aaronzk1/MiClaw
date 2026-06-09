import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

export function BackupPage() {
  const [backups, setBackups] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => { api.backupList?.().then(setBackups).catch(() => {}) }, [])

  const handleCreate = async () => {
    setCreating(true)
    const result = await api.backupCreate?.()
    if (result) {
      const list = await api.backupList?.()
      if (list) setBackups(list)
    }
    setCreating(false)
  }

  const handleRestore = async (path: string) => {
    if (!confirm('确认从此备份恢复？当前数据将被备份后覆盖。')) return
    setRestoring(path)
    const ok = await api.backupRestore?.(path)
    setRestoring(null)
    if (ok) alert('恢复成功，请重启应用')
    else alert('恢复失败')
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return '-'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  return (
    <div className="page" id="page-backup">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>备份管理</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="badge badge-blue">{backups.length} backups</span>
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
              {creating ? '创建中...' : '+ 创建备份'}
            </button>
          </div>
        </div>
        {backups.length === 0 && (
          <div className="empty-state"><h3>无备份</h3><p>系统每小时自动备份一次，也可手动创建</p></div>
        )}
        {backups.map((b, i) => (
          <div key={i} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                {i === 0 ? 'Latest' : '#' + (i + 1)}
              </div>
              <div style={{ flex: 1 }}>
                <div className="card-title">{new Date(b.timestamp).toLocaleString('zh-CN')}</div>
                <div className="card-sub">
                  {b.conversations} conversations / {b.messages} messages / {formatSize(b.size)}
                </div>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={() => handleRestore(b.path)} disabled={restoring === b.path}>
                {restoring === b.path ? '恢复中...' : '恢复'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}