import { useState } from 'react'
import { api } from '../lib/ipc'

const presetAgents = [
  { name: '\u4ee3\u7801\u5ba1\u67e5\u5458', desc: '\u4e13\u4e1a\u4ee3\u7801\u5ba1\u67e5\uff0c\u53d1\u73b0\u6f5c\u5728BUG\u548c\u5b89\u5168\u6f0f\u6d1e', model: 'deepseek-chat', color: '#16a34a', skills: ['\u4ee3\u7801', '\u5206\u6790'] },
  { name: '\u6570\u636e\u5206\u6790\u5e08', desc: 'CSV/Excel\u6570\u636e\u5206\u6790\uff0c\u7edf\u8ba1\u56fe\u8868\u751f\u6210', model: 'gpt-4o', color: '#f59e0b', skills: ['\u5206\u6790', '\u5199\u4f5c'] },
  { name: '\u5199\u4f5c\u52a9\u624b', desc: '\u6587\u7ae0\u5199\u4f5c\u3001\u6587\u6848\u521b\u4f5c\u3001\u7ffb\u8bd1\u6da6\u8272', model: 'claude-3.5-sonnet', color: '#ec4899', skills: ['\u5199\u4f5c', '\u7ffb\u8bd1'] },
  { name: '\u7814\u7a76\u52a9\u624b', desc: '\u8bba\u6587\u68c0\u7d22\u3001\u6587\u732e\u7efc\u8ff0\u3001\u7814\u7a76\u65b9\u6cd5', model: 'gpt-4o', color: '#8b5cf6', skills: ['\u641c\u7d22', '\u5206\u6790'] },
  { name: 'DevOps\u5de5\u7a0b\u5e08', desc: 'CI/CD\u914d\u7f6e\u3001\u670d\u52a1\u5668\u8fd0\u7ef4\u3001\u76d1\u63a7\u544a\u8b66', model: 'deepseek-chat', color: '#06b6d4', skills: ['\u4ee3\u7801', '\u641c\u7d22'] },
  { name: '\u4ea7\u54c1\u7ecf\u7406', desc: 'PRD\u64b0\u5199\u3001\u9700\u6c42\u5206\u6790\u3001\u7ade\u54c1\u8c03\u7814', model: 'gpt-4o', color: '#f97316', skills: ['\u5199\u4f5c', '\u5206\u6790', '\u641c\u7d22'] },
  { name: '\u6559\u5b66\u52a9\u624b', desc: '\u8bfe\u4ef6\u5236\u4f5c\u3001\u77e5\u8bc6\u89e3\u91ca\u3001\u7ec3\u4e60\u9898\u751f\u6210', model: 'qwen-max', color: '#4f46e5', skills: ['\u5199\u4f5c', '\u5bf9\u8bdd'] },
  { name: '\u7f51\u9875\u5f00\u53d1\u8005', desc: 'HTML/CSS/JS\u524d\u7aef\u5f00\u53d1\uff0c\u54cd\u5e94\u5f0f\u8bbe\u8ba1', model: 'deepseek-chat', color: '#ec4899', skills: ['\u4ee3\u7801', '\u5206\u6790'] },
]

export function AgentMarketPage() {
  const [importing, setImporting] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = search ? presetAgents.filter(a => a.name.includes(search) || a.desc.includes(search)) : presetAgents

  const handleImport = async (agent: typeof presetAgents[0]) => {
    setImporting(agent.name)
    const newAgent = {
      id: 'ag-market-' + Date.now(),
      name: agent.name,
      model: agent.model,
      color: agent.color,
      enabled: true,
      systemPrompt: `\u4f60\u662f${agent.name}\u3002${agent.desc}`,
      skills: agent.skills,
      source: 'market',
    }
    await api.agentsSave(newAgent)
    setTimeout(() => setImporting(null), 500)
  }

  return (
    <div className="page" id="page-agent-market">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'Agent \u5e02\u573a'}</h2>
          <span className="badge badge-blue">{filtered.length} {'\u4e2a\u6a21\u677f'}</span>
        </div>
        <div className="filter-bar">
          <input type="text" placeholder={'\u641c\u7d22 Agent \u6a21\u677f...'} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div className="dash-grid">
          {filtered.map((agent, i) => (
            <div key={i} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: agent.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>{agent.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div className="card-title">{agent.name}</div>
                  <div className="card-sub">{agent.model}</div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>{agent.desc}</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {agent.skills.map(s => <span key={s} className="badge badge-blue">{s}</span>)}
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => handleImport(agent)} disabled={importing === agent.name} style={{ width: '100%', justifyContent: 'center' }}>
                {importing === agent.name ? '\u5bfc\u5165\u4e2d...' : '\u4e00\u952e\u5bfc\u5165'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
