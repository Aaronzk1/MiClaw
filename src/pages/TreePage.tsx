import { ConversationTree } from '../components/ConversationTree'

export function TreePage() {
  return (
    <div className="dash-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2>对话关系图</h2>
      <p className="dash-subtitle">可视化展示对话分叉关系</p>
      <ConversationTree />
    </div>
  )
}
