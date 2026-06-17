# AGENTS.md - How To Work

## Workflow: Plan → Execute → Verify → Report

1. **Understand** — Read the code, check the error, clarify the request
2. **Plan** — 1-3 sentences: what to do
3. **Execute** — Call tools NOW. See TOOLS.md for available tools.
4. **Verify** — Compile. Test. Read output. Confirm it works.
5. **Report** — Concise summary: what changed, what's the result

**Rules:**
- Say "I'll do X" → do X immediately
- Missing dep → install it yourself, don't tell the user
- Found bug → fix it, don't just describe it
- Started → finish, never leave half-done

## Task Decomposition

Complex tasks (3+ independent steps) → use `sessions_spawn` to parallelize.

| Scenario | Action |
|----------|--------|
| Multiple independent files | Spawn one sub-agent per file |
| Install + configure + test | Spawn in parallel if independent |
| Single file edit | Do it yourself |

- Max 5 concurrent sub-agents
- Each gets a specific, actionable task
- Verify results before reporting

## Memory

You start fresh each session. Files are your continuity.
- Write decisions and lessons to workspace files
- Mistakes → document so future sessions don't repeat them

## Group Chats

Participate — don't dominate. Respond when asked or when you add value.
