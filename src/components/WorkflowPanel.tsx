import { useState } from 'react'

interface WorkflowStep {
  id?: number
  step?: string
  description?: string
  status?: string
  category?: string
  note?: string
  estimatedMinutes?: number
  dependencies?: number[]
  risk?: string
  tasks?: string[]
  risks?: string[]
  duration?: string
  name?: string
}

interface WorkflowPanelProps {
  type: string
  data: any
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(100, pct)}%`, height: '100%',
        background: pct >= 100 ? 'var(--success)' : 'var(--accent)',
        borderRadius: 3, transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function StepItem({ step, index, status }: { step: string; index: number; status?: string }) {
  const icon = status === 'completed' ? '✓' : status === 'running' ? '●' : status === 'blocked' ? '✗' : '○'
  const color = status === 'completed' ? 'var(--success)' : status === 'running' ? 'var(--accent)' : status === 'blocked' ? 'var(--error)' : 'var(--text4)'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
      <span style={{ color, fontWeight: 700, fontSize: 14, minWidth: 18, textAlign: 'center' }}>{icon}</span>
      <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{step}</span>
    </div>
  )
}

function DecomposeView({ data }: { data: any }) {
  const steps: WorkflowStep[] = data.steps || []
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
        {steps.length} 个步骤 · 预计 {data.totalMinutes || 0} 分钟
      </div>
      {steps.map(s => (
        <div key={s.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--text4)', minWidth: 20, fontWeight: 600 }}>#{s.id}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{s.description}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              {s.category && <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-light)', padding: '1px 6px', borderRadius: 4 }}>{s.category}</span>}
              {s.risk && s.risk !== 'low' && <span style={{ fontSize: 10, color: 'var(--error)', background: 'var(--error-light, rgba(220,38,38,0.1))', padding: '1px 6px', borderRadius: 4 }}>{s.risk === 'high' ? '高风险' : '中风险'}</span>}
              {s.estimatedMinutes && <span style={{ fontSize: 10, color: 'var(--text4)' }}>~{s.estimatedMinutes}min</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DecisionView({ data }: { data: any }) {
  const options = data.options || []
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{data.question}</div>
      {options.map((o: any) => (
        <div key={o.rank} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: o.rank === 1 ? 'var(--success)' : 'var(--text4)' }}>#{o.rank}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{o.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text4)', marginLeft: 'auto' }}>总分 {o.scores?.['总分']}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(o.scores || {}).filter(([k]) => k !== '总分').map(([k, v]) => (
              <span key={k} style={{ fontSize: 10, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4 }}>{k}: {String(v)}</span>
            ))}
          </div>
        </div>
      ))}
      {options.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>推荐: {options[0].name}</div>
      )}
    </div>
  )
}

function ProgressView({ data }: { data: any }) {
  const entries = data.entries || []
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{data.taskTitle}</span>
        <span style={{ fontSize: 11, color: 'var(--text4)' }}>{data.pct}% · {data.completed}/{data.total}</span>
      </div>
      <ProgressBar pct={data.pct || 0} />
      <div style={{ marginTop: 8 }}>
        {entries.map((e: any, i: number) => (
          <StepItem key={i} step={e.step} index={i} status={e.status} />
        ))}
      </div>
    </div>
  )
}

function ProjectPlanView({ data }: { data: any }) {
  const milestones = data.milestones || []
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>目标: {data.objective}</div>
      <div style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 8 }}>预计: {data.estimatedWeeks}周</div>
      {data.constraints?.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 8 }}>约束: {data.constraints.join(', ')}</div>
      )}
      {milestones.map((ms: any) => (
        <div key={ms.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>M{ms.id}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ms.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 'auto' }}>{ms.duration}</span>
          </div>
          {ms.tasks?.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 28 }}>{ms.tasks.join(' → ')}</div>
          )}
          {ms.risks?.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--error)', paddingLeft: 28, marginTop: 2 }}>风险: {ms.risks.join(', ')}</div>
          )}
        </div>
      ))}
    </div>
  )
}

function TemplateView({ data }: { data: any }) {
  const t = data.template || data
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{t.description}</div>
      {t.steps?.map((s: string, i: number) => (
        <StepItem key={i} step={s} index={i} />
      ))}
    </div>
  )
}

export function WorkflowPanel({ type, data }: WorkflowPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  const viewMap: Record<string, () => any> = {
    decompose: () => <DecomposeView data={data} />,
    decision: () => <DecisionView data={data} />,
    progress: () => <ProgressView data={data} />,
    projectPlan: () => <ProjectPlanView data={data} />,
    template: () => <TemplateView data={data} />,
  }

  const labelMap: Record<string, string> = {
    decompose: '任务分解',
    decision: '决策分析',
    progress: '进度跟踪',
    projectPlan: '项目规划',
    template: '工作流模板',
  }

  const render = viewMap[type]
  if (!render) return null

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      marginTop: 6, overflow: 'hidden', background: 'var(--bg)',
    }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg2)', borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          fontSize: 12, fontWeight: 600, color: 'var(--text2)',
        }}
      >
        <span style={{ color: 'var(--accent)' }}>{collapsed ? '▶' : '▼'}</span>
        <span>{labelMap[type] || type}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: '10px 12px' }}>
          {render()}
        </div>
      )}
    </div>
  )
}

export function parseWorkflowFromOutput(output: string): { type: string; data: any } | null {
  if (!output) return null
  try {
    // Find JSON block with __workflow marker
    const jsonMatch = output.match(/\{[\s\S]*"__workflow"\s*:\s*"([^"]+)"[\s\S]*\}/)
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0])
      const type = data.__workflow
      if (type) return { type, data }
    }
  } catch {}
  return null
}
