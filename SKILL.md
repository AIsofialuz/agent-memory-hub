# agent-memory-hub

**Category:** Memory & Context  
**Version:** 1.0.0  
**Type:** MCP Server

> Give any AI agent true long-term memory. Store facts, preferences, project details, and notes. Retrieve them with intelligent search. Never start from scratch again.

---

## What It Does

`agent-memory-hub` is an MCP server that provides persistent, searchable memory for AI agents. It stores information between sessions using a local JSON database and retrieves it using BM25 full-text search with importance and recency weighting.

Think of it as a second brain for your agent — one that actually remembers who you are, what you're working on, and what you prefer.

---

## When to Use

| Situation | Action |
|-----------|--------|
| Session start | Call `get_relevant_context` with the user's first message |
| User shares a preference | Call `store_memory` immediately |
| User references past work | Call `search_memory` before responding |
| User asks "do you remember…" | Call `search_memory` or `get_relevant_context` |
| End of important session | Call `memory_summary` to review what was captured |
| User corrects outdated info | Call `update_memory` |

---

## Tools Reference

### `store_memory(key, content, tags?, importance?)`
Store any fact, preference, or note. Tags and importance are auto-detected.

**Good keys:** `user_name`, `preferred_stack`, `project_deadline`, `api_key_note`, `client_requirement_1`

```
store_memory("user_preferred_editor", "User uses VS Code with Vim keybindings")
→ Auto-tags: ["preference", "technical"]
→ Auto-importance: 6/10
```

---

### `search_memory(query, limit?, tags?)`
BM25 ranked search across all memories. Weights importance and recency.

```
search_memory("code editor preferences")
→ Returns top matches with scores
```

---

### `get_relevant_context(user_query)`
The power tool. Automatically surfaces the best memories for the current task. Call this at the start of every session.

```
get_relevant_context("Help me refactor the auth module")
→ TECHNICAL: preferred_stack, framework_version
→ PROJECT: auth_module_notes, project_deadline
→ PREFERENCE: user_coding_style
```

---

### `update_memory(key, new_content?, tags?, importance?)`
Update any field of an existing memory without deleting it.

```
update_memory("project_deadline", "Deadline moved to June 20th")
```

---

### `list_memories(tags?, limit?, sort?)`
Browse stored memories. Sort by `recent`, `importance`, or `access` count.

```
list_memories(tags=["project"], sort="importance", limit=10)
```

---

### `forget_memory(key)`
Permanently remove a memory.

```
forget_memory("old_api_endpoint")
```

---

### `memory_summary()`
High-level overview: count, top tags, most important, most accessed.

---

## Example Agent Workflow

```
User: "Let's continue working on the SaaS dashboard"

Agent step 1: get_relevant_context("SaaS dashboard project")
→ Retrieves: project goals, tech stack, deadline, previous decisions

Agent step 2: [Responds with full context, no need to re-explain]

User: "By the way, we switched from Supabase to PlanetScale"

Agent step 3: store_memory("database_choice", "Using PlanetScale (switched from Supabase in May 2025)", importance=8)

[Next session — agent immediately knows this without being told again]
```

---

## Installation

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "agent-memory-hub": {
      "command": "node",
      "args": ["/path/to/agent-memory-hub/build/index.js"]
    }
  }
}
```

### Claude Code CLI
```bash
claude mcp add agent-memory-hub -- node /path/to/agent-memory-hub/build/index.js
```

### Build from source
```bash
npm install && npm run build
```

---

## Storage

- Default: `~/.agent-memory/memories.json`
- Override: set `AGENT_MEMORY_DIR` environment variable
- Format: human-readable JSON, easy to backup

---

## Auto-Tag Categories

`preference` · `project` · `identity` · `technical` · `task` · `credential` · `note` · `person` · `config`

---

## Requirements

- Node.js 18+
- No API keys
- No external servers
- No Python or Docker
