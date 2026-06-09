import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

export function AboutPage() {
  const [info, setInfo] = useState<any>({})
  useEffect(() => { api.systemInfo().then(setInfo).catch(() => {}) }, [])

  return (
    <div className="page" id="page-about">
      <div className="pg" style={{ maxWidth: 'none', width: '100%' }}>
        <div className="about-hero">
          <img src="logo.png" alt="AaronClaw" style={{width:56,height:56,borderRadius:14,boxShadow:"0 6px 20px rgba(79,70,229,0.18)"}} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>AaronClaw</h2>
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>AI Agent Desktop Client v3.0.0</p>
        </div>
        <div className="dash-grid" style={{ maxWidth: 'none' }}>
          {[
            { label: 'Hermes', desc: '\u610f\u56fe\u8def\u7531 + \u8bb0\u5fc6 + \u6280\u80fd', color: '#4f46e5' },
            { label: 'OpenClaw', desc: 'LLM \u63a8\u7406\u7f51\u5173', color: '#16a34a' },
            { label: 'SQLite', desc: '\u7c7b\u578b\u5b89\u5168\u5b58\u50a8', color: '#0ea5e9' },
            { label: 'React', desc: 'UI \u6846\u67b6 + Zustand', color: '#ec4899' },
          ].map((d, i) => (
            <div key={i} className="dash-card" style={{ textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: d.color + '15', color: d.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{d.label[0]}</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{d.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{d.desc}</div>
            </div>
          ))}
        </div>
        <div className="about-table" style={{ maxWidth: 'none' }}>
          <div className="about-row"><span>{'\u7248\u672c'}</span><span style={{ fontFamily: 'var(--mono)' }}>3.0.0</span></div>
          <div className="about-row"><span>Electron</span><span style={{ fontFamily: 'var(--mono)' }}>{info.electron || '-'}</span></div>
          <div className="about-row"><span>Chrome</span><span style={{ fontFamily: 'var(--mono)' }}>{info.chrome || '-'}</span></div>
          <div className="about-row"><span>Node.js</span><span style={{ fontFamily: 'var(--mono)' }}>{info.node || '-'}</span></div>
          <div className="about-row"><span>{'\u5e73\u53f0'}</span><span>{info.platform} / {info.arch}</span></div>
          <div className="about-row"><span>{'\u6570\u636e\u76ee\u5f55'}</span><span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{info.userData || '-'}</span></div>
        </div>
        <div style={{ maxWidth: 600, margin: '16px auto 0' }}>
          <div className="setting-group">
            <h4>{'\u4f9d\u8d56\u5e93'}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[
                ['React', '19.0'], ['TypeScript', '5.7'], ['Vite', '6.0'], ['Zustand', '5.0'],
                ['Electron', '35.0'], ['better-sqlite3', '12.10'], ['Tailwind CSS', '4.0'], ['marked', '15.0'],
                ['highlight.js', '11.11'], ['DOMPurify', '3.2'], ['@modelcontextprotocol/sdk', '1.29'], ['drizzle-orm', '0.45'],
              ].map(([name, ver], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', fontSize: 11.5 }}>
                  <span style={{ color: 'var(--text2)' }}>{name}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text4)' }}>{ver}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
