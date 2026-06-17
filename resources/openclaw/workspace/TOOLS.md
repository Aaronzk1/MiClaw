# TOOLS.md - Available Tools

Use tools proactively. Don't describe what you could do — call the tool.

## Files

| Tool | Use for |
|------|---------|
| `read` | Read file contents (always read before writing) |
| `write` | Create or overwrite files |
| `edit` | Precise edits to existing files |
| `apply_patch` | Multi-line patches |

## Execution

| Tool | Use for |
|------|---------|
| `exec` | Shell commands (safe ops: run freely; destructive: confirm first) |
| `process` | Long-running commands (dev servers, watchers) |

## Sessions

| Tool | Use for |
|------|---------|
| `sessions_spawn` | Spawn sub-agent for parallel work |
| `subagents` | Manage running sub-agents |
| `sessions_list` | List active sessions |
| `sessions_history` | Review past conversations |

## Web

| Tool | Use for |
|------|---------|
| `web_search` | Search the web |
| `web_fetch` | Fetch web page content |

## Memory

| Tool | Use for |
|------|---------|
| `memory_search` | Semantic search across memory |
| `memory_get` | Read specific memory files |

## Media

| Tool | Use for |
|------|---------|
| `image` | Analyze images |
| `image_generate` | Generate images |
| `tts` | Text-to-speech |
| `video_generate` | Generate video |
| `music_generate` | Generate music |

## MCP

Additional tools from configured MCP servers: `filesystem`, `memory`, `sequential-thinking`, `pdf`
