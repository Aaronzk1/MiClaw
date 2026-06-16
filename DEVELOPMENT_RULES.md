# MiClaw 开发规范 — 必读

> 改代码前先看这个，避免破坏已有功能

---

## 一、绝对不能动的东西

| 项目 | 原因 |
|------|------|
| `electron/main.ts` 的 `createWindow()` | 关闭窗口=退出app，不要改成隐藏到托盘 |
| `electron/main.ts` 的 `import` 行 | 所有import必须保留，不要删任何函数 |
| `electron/preload.ts` | 所有API方法必须保留，不要删任何方法 |
| `electron/storage/db.ts` | SQLite存储层，不要改表结构 |
| `node_modules/electron/` | 不要手动改electron二进制或path.txt |
| `package.json` 的 `electron` 版本 | 必须是 `^35.0.0`，不要改成其他版本 |
| `src/stores/appStore.ts` | Zustand状态，不要删任何字段 |

---

## 二、Electron 版本锁定

```
electron: ^35.0.0  # 不要改成42或其他版本
```

**原因**: better-sqlite3的C++代码只兼容Electron 35的V8 API。改版本会导致native模块编译失败。

**如果npm install后electron二进制丢失**:
```bash
# 用缓存的zip恢复
python3 -c "
import zipfile, os
dst = 'node_modules/electron/dist'
os.makedirs(dst, exist_ok=True)
with zipfile.ZipFile(os.path.expanduser('~/AppData/Local/Temp/electron-v35.zip'), 'r') as z:
    z.extractall(dst)
"
echo "electron.exe" > node_modules/electron/path.txt
npx electron-rebuild -f -w better-sqlite3
```

---

## 三、环境变量

`ELECTRON_RUN_AS_NODE` 必须在启动时清除：

```bat
@echo off
setlocal
cd /d <项目根目录>
set "ELECTRON_RUN_AS_NODE="
start "" "node_modules\electron\dist\electron.exe" .
```

**不要**在launch脚本里设置 `ELECTRON_RUN_AS_NODE=1`。

---

## 四、Vite 构建规则

1. **不要在 `vite.config.ts` 的 electron plugin 里加 `onstart(args) { args.startup() }`** — 这会在build时自动启动electron导致卡死
2. **构建命令**: `npx vite build --mode production`
3. **启动命令**: `node_modules/electron/dist/electron.exe .`

---

## 五、IPC 规则

### 5.1 不要用动态循环注册handler

```javascript
// ❌ 错误 — Vite tree-shaking会删除这个循环
for (const col of ['agents', 'providers', ...]) {
  ipcMain.handle(col + ':list', () => kvList(col))
}

// ✅ 正确 — 每个handler单独写
ipcMain.handle('agents:list', () => kvList('agents'))
ipcMain.handle('providers:list', () => kvList('providers'))
```

### 5.2 新增IPC必须三处同步

1. `electron/main.ts` 或 `electron/ipc/*.ts` — 添加 `ipcMain.handle()`
2. `electron/preload.ts` — 添加 `apiName: () => ipcRenderer.invoke()`
3. `src/types/ipc-api.ts` — 添加类型声明

### 5.3 preload.ts 结构

```typescript
contextBridge.exposeInMainWorld('api', {
  // 所有方法都在这里，不要删任何一行
  methodName: (args) => ipcRenderer.invoke('channel:name', args),
})
```

---

## 六、React 规则

### 6.1 页面文件

- 每个页面导出命名函数: `export function PageName()`
- 用 `className="page"` 包裹（不是 `page active`）
- 不要用 `prompt()` 或 `confirm()` — 用 Modal 弹窗
- 不要用 `alert()` — 用状态提示

### 6.2 路由注册

新增页面必须在 `src/App.tsx` 中:
1. 添加 lazy import
2. 添加到 pages map

### 6.3 侧边栏

侧边栏结构在 `src/components/Sidebar.tsx` 的 `navSections` 数组中。当前分类:
- Agent: Agent管理
- 工具: 技能中心/记忆管理/上下文管理/知识库/工作流/定时任务/MCP服务器
- 协作: 群聊
- 工作区: 工作区管理/对话分析
- 设置: 模型配置/备份管理/日志查看/通用设置/关于

---

## 七、CSS 规则

- 用 CSS 变量，不要硬编码颜色
- `.page` class 已经是 `display:flex`，不需要 `.active`
- 模型选择器用 `<select className="model-select">`
- 按钮用 `className="btn btn-primary"` / `btn-secondary` / `btn-danger` / `btn-ghost`

---

## 八、SQLite 规则

- 所有数据存储在 `kv` 表（key-value），用 `ns` 字段分类
- 消息存在 `messages` 表
- 群聊消息在 `gc_messages` 表
- 新增列用 `ALTER TABLE ... ADD COLUMN`，不要 DROP TABLE

---

## 九、Gateway 规则

- Gateway 端口从 config 读取: `config.gateway?.port || 18789`
- 不要硬编码端口
- Gateway 可能不运行 — 所有fetch调用必须有 try/catch

---

## 十、改完后必做

1. `npx tsc --noEmit` — 0个错误
2. `npx vite build --mode production` — 构建成功
3. `node_modules/electron/dist/electron.exe .` — 窗口弹出
4. 逐个点击侧边栏所有页面 — 无白屏
5. 发送一条对话 — 有回复（需Gateway运行）

---

**违反以上任何一条都会导致项目崩溃。请严格遵守。**
