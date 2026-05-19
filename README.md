# agent-memory-hub

**Persistent, intelligent, searchable long-term memory for AI agents.**

Store facts, preferences, notes, and project context. Retrieve them with full-text BM25 search, importance scoring, and recency weighting. No API keys. No external servers. Works out of the box.

---

## Features

- **7 powerful tools** — store, search, retrieve context, update, list, forget, summarize
- **BM25 full-text search** — proper ranked search with IDF, not just string matching
- **Auto-tagging** — automatically infers categories (preference, project, technical, task, credential, etc.)
- **Auto importance scoring** — detects urgency signals in content
- **Recency + importance weighting** — more relevant memories surface first
- **Atomic writes** — corruption-safe file persistence
- **Zero dependencies** — only the MCP SDK; no native binaries, no Python, no Docker
- **Configurable storage** — override path with `AGENT_MEMORY_DIR` env var

---

## Installation

### 1. Clone and build

```bash
git clone https://github.com/yourname/agent-memory-hub
cd agent-memory-hub
npm install
npm run build
```

### 2. Add to Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-memory-hub": {
      "command": "node",
      "args": ["C:\\Users\\HP\\agent-memory-hub\\build\\index.js"]
    }
  }
}
```

### 3. Add to Claude Code (MCP CLI)

```bash
claude mcp add agent-memory-hub -- node "C:\Users\HP\agent-memory-hub\build\index.js"
```

### Custom storage directory

```json
{
  "mcpServers": {
    "agent-memory-hub": {
      "command": "node",
      "args": ["C:\\Users\\HP\\agent-memory-hub\\build\\index.js"],
      "env": {
        "AGENT_MEMORY_DIR": "C:\\Users\\HP\\my-agent-memories"
      }
    }
  }
}
```

Default storage: `~/.agent-memory/memories.json`

---

## Tools

### `store_memory`

Store any piece of information worth remembering.

```
key:        "user_preferred_language"
content:    "User always prefers TypeScript over JavaScript"
tags:       ["preference", "technical"]   ← auto-detected if omitted
importance: 7                             ← auto-scored if omitted
overwrite:  true                          ← upsert: update if key exists, create if not
```

By default, storing a key that already exists returns an error. Set `overwrite: true` to silently update the existing memory instead — useful when you want "set this value" semantics without checking first.

### `search_memory`

BM25 full-text search across all memories.

```
query: "typescript preferences"
limit: 5          ← optional, default 5
tags:  ["technical"]  ← optional filter
```

### `get_relevant_context`

Auto-retrieve the best memories for a given query. Use this at session start.

```
user_query: "Help me set up the project authentication"
→ Returns: identity memories, project memories, technical preferences
```

### `update_memory`

Modify existing memory content, tags, or importance.

```
key:         "user_preferred_language"
new_content: "User prefers TypeScript, but accepts Python for scripts"
importance:  8
```

### `list_memories`

Browse memories with sorting and filtering.

```
tags: ["project"]
sort: "importance"   ← "recent" | "importance" | "access"
limit: 10
```

### `forget_memory`

Permanently delete a memory.

```
key: "old_api_key"
```

### `memory_summary`

Get a full overview — counts, top tags, most important and most accessed memories.

---

## Storage Format

Memories are stored as plain JSON at `~/.agent-memory/memories.json`. Human-readable, easy to backup or inspect.

```json
{
  "version": "1.0.0",
  "created": "2025-01-01T00:00:00.000Z",
  "lastUpdated": "2025-06-01T12:00:00.000Z",
  "memories": [
    {
      "id": "uuid",
      "key": "user_preferred_language",
      "content": "User prefers TypeScript over JavaScript",
      "tags": ["preference", "technical"],
      "importance": 7,
      "createdAt": "...",
      "updatedAt": "...",
      "accessCount": 12,
      "lastAccessed": "..."
    }
  ]
}
```

---

## Auto-Tagging Categories

The system auto-detects these categories from content:

| Tag | Trigger signals |
|-----|----------------|
| `preference` | prefer, like, love, hate, favorite, avoid |
| `project` | project, working on, building, repository |
| `identity` | I am, my name, I work, my role |
| `technical` | code, api, database, framework, docker |
| `task` | todo, must, deadline, remind |
| `credential` | password, secret, token, api key |
| `note` | note, remember that, fyi, heads up |
| `person` | name is, email, phone, contact |
| `config` | config, setting, env var, port, url |

---

## Development

```bash
npm run dev    # watch mode
npm run build  # production build
```

---

## License

MIT
