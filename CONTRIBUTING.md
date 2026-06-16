# 贡献指南

感谢你对 MiClaw 的关注！我们欢迎各种形式的贡献。

## 如何贡献

### 报告 Bug

1. 在 Issues 中搜索是否已有相同问题
2. 如果没有，创建新的 Issue
3. 请包含：
   - 问题描述
   - 复现步骤
   - 期望行为
   - 实际行为
   - 环境信息（OS、Node.js 版本等）

### 提交新功能

1. 在 Issues 中讨论新功能的可行性
2. Fork 本仓库
3. 创建特性分支
4. 提交代码
5. 创建 Pull Request

### 代码规范

请参考 [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md)

### 开发环境搭建

```bash
# 克隆仓库
git clone https://github.com/AaronClaw/MiClaw.git
cd MiClaw

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码格式（不影响功能）
- `refactor:` 重构
- `perf:` 性能优化
- `test:` 测试
- `chore:` 构建/工具

示例：
```
feat: 添加 Agent 批量导入功能
fix: 修复对话历史搜索无响应问题
docs: 更新 README 安装说明
```

### Pull Request 流程

1. 确保代码符合项目规范
2. 更新相关文档（如有必要）
3. 确保 `npx tsc --noEmit` 无错误
4. 确保 `npm run build` 成功
5. 在 PR 中描述更改内容

## 问题标签

- `bug` — Bug 报告
- `enhancement` — 新功能请求
- `documentation` — 文档相关
- `good first issue` — 适合新手
- `help wanted` — 需要帮助

## 行为准则

请保持友善和尊重，共同营造良好的社区氛围。

## 许可证

贡献的代码将采用与本项目相同的 MIT 许可证。
