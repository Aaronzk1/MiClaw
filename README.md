# MiClaw

Universal AI Agent Desktop — 开源跨平台 AI Agent 管理工具

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/electron-35-brightgreen.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.7-3178c6.svg)

## 功能特性

### 🤖 Agent 管理
- 多 Agent 并行管理，支持自定义系统提示词
- 多模型提供商配置（OpenAI、Anthropic、Google、本地模型等）
- Agent 能力配置与技能市场

### 💬 智能对话
- 流式响应，实时显示思考过程
- Markdown 渲染，代码高亮，LaTeX 数学公式
- 对话历史管理，支持搜索和分组
- 工具调用可视化（瀑布图展示）

### 👥 群组协作
- 多 Agent 群组对话
- Agent 间协作流程
- 群聊消息管理

### 🔧 工具生态
- **MCP Servers** — Model Context Protocol 服务器管理
- **插件市场** — 扩展 Agent 能力
- **日程规划** — AI 辅助任务调度
- **关系图谱** — 可视化 Agent 与会话关系

### 📊 数据洞察
- **活跃分析** — 使用热力图展示
- **Token 经济** — 成本统计与优化建议
- **对话分析** — 会话质量评估

### ⚙️ 系统管理
- **Gateway 监控** — 后端服务状态
- **设置中心** — 全局配置管理
- **备份管理** — 数据导出与恢复

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 35 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 状态管理 | Zustand 5 |
| 样式方案 | Tailwind CSS 4 |
| 数据库 | SQLite (better-sqlite3) |
| 协议支持 | MCP SDK |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9
- Windows / macOS / Linux

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
# 构建前端
npm run build

# 启动 Electron
node_modules/electron/dist/electron.exe .
```

### 打包安装程序

```bash
npm run electron:build
```

## 项目结构

```
MiClaw/
├── electron/               # Electron 主进程
│   ├── main.ts            # 主窗口创建
│   ├── preload.ts         # 预加载脚本
│   ├── ipc/               # IPC 通信处理
│   └── storage/           # SQLite 存储层
├── src/                   # React 前端
│   ├── pages/             # 页面组件
│   ├── components/        # 通用组件
│   ├── stores/            # Zustand 状态
│   ├── lib/               # 工具函数
│   └── types/             # TypeScript 类型
├── data/                  # 配置数据
└── resources/             # 资源文件
```

## 开发规范

详细开发规范请参考 [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md)

### 核心原则

1. **IPC 三处同步** — 主进程、preload、类型声明必须同步更新
2. **不删原有代码** — 只增不删，保持向后兼容
3. **CSS 变量** — 使用主题变量，不硬编码颜色
4. **构建验证** — 改完代码必须通过 TypeScript 检查和构建测试

## 配置说明

### 数据库

应用使用 SQLite 存储所有数据，包括：
- `kv` 表 — 键值配置存储
- `messages` 表 — 对话消息
- `gc_messages` 表 — 群聊消息

### API 密钥

所有 API 密钥通过 Electron 的 `safeStorage` 加密存储，不会明文保存。

## 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 开发流程

1. 阅读 [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md)
2. 确保 `npx tsc --noEmit` 无错误
3. 确保 `npm run build` 成功
4. 测试所有页面无白屏

## 许可证

本项目采用 [MIT 许可证](LICENSE) — 详见 LICENSE 文件

## 致谢

- [Electron](https://electronjs.org/) — 跨平台桌面框架
- [React](https://react.dev/) — 用户界面库
- [Vite](https://vitejs.dev/) — 下一代前端构建工具
- [Zustand](https://zustand-demo.pmnd.rs/) — 轻量状态管理
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite 驱动
