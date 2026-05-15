import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from './store.js';
import { search } from './search.js';
import { autoTags, autoImportance } from './auto.js';
import type { Memory } from './types.js';

const store = new MemoryStore();

const server = new Server(
  { name: 'agent-memory-hub', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ─── Tool Definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'store_memory',
      description:
        'Store a new memory — fact, preference, project detail, note, or any information worth remembering. ' +
        'Tags and importance are auto-detected from content if not provided.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Unique snake_case identifier (e.g. "user_name", "preferred_language", "project_deadline")',
          },
          content: {
            type: 'string',
            description: 'The memory content — be descriptive and specific for better retrieval',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Categorization tags (auto-detected if omitted)',
          },
          importance: {
            type: 'number',
            description: 'Importance score 1-10 — higher = retrieved first (auto-scored if omitted)',
          },
        },
        required: ['key', 'content'],
      },
    },
    {
      name: 'search_memory',
      description:
        'Search memories using BM25 full-text search with importance and recency weighting. ' +
        'Supports optional tag filtering to narrow scope.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query — natural language or keywords' },
          limit: { type: 'number', description: 'Max results to return (default: 5)' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only search memories with these tags',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_relevant_context',
      description:
        'Auto-retrieve the most relevant memories for a given user query or task. ' +
        'Use this at the start of any session or when the user references past context. ' +
        'Returns formatted context ready to inject into your reasoning.',
      inputSchema: {
        type: 'object',
        properties: {
          user_query: {
            type: 'string',
            description: 'The current user query, task description, or topic to find context for',
          },
        },
        required: ['user_query'],
      },
    },
    {
      name: 'update_memory',
      description: 'Update the content, tags, or importance of an existing memory by key.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'The memory key to update' },
          new_content: { type: 'string', description: 'Replacement content (omit to keep existing)' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'New tag list — replaces existing tags',
          },
          importance: { type: 'number', description: 'New importance score 1-10' },
        },
        required: ['key'],
      },
    },
    {
      name: 'list_memories',
      description: 'Browse stored memories with optional tag filtering and sort order.',
      inputSchema: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter to only memories with these tags',
          },
          limit: { type: 'number', description: 'Max results (default: 20)' },
          sort: {
            type: 'string',
            enum: ['recent', 'importance', 'access'],
            description: 'Sort by: recent (default), importance, or access count',
          },
        },
      },
    },
    {
      name: 'forget_memory',
      description: 'Permanently delete a specific memory by key.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'The memory key to delete' },
        },
        required: ['key'],
      },
    },
    {
      name: 'memory_summary',
      description:
        'Get a high-level overview of what the agent knows — total count, top tags, ' +
        'most important memories, and access statistics. Good for orientation at session start.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

// ─── Tool Handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      // ── store_memory ───────────────────────────────────────────────────────
      case 'store_memory': {
        const key = String(a['key'] ?? '').trim();
        const content = String(a['content'] ?? '').trim();
        if (!key) return err('key is required');
        if (!content) return err('content is required');

        const provided = Array.isArray(a['tags']) ? (a['tags'] as string[]) : [];
        const importance = a['importance'] !== undefined ? Number(a['importance']) : undefined;
        const tags = autoTags(content, provided);
        const imp = autoImportance(content, importance);

        const memory = store.add({ key, content, tags, importance: imp });
        return ok(
          `Memory stored successfully.\n` +
          `  Key:        ${memory.key}\n` +
          `  Importance: ${memory.importance}/10\n` +
          `  Tags:       ${memory.tags.length ? memory.tags.join(', ') : '(none)'}\n` +
          `  ID:         ${memory.id}`
        );
      }

      // ── search_memory ──────────────────────────────────────────────────────
      case 'search_memory': {
        const query = String(a['query'] ?? '').trim();
        if (!query) return err('query is required');
        const limit = a['limit'] !== undefined ? Math.max(1, Number(a['limit'])) : 5;
        const tags = Array.isArray(a['tags']) ? (a['tags'] as string[]) : undefined;

        const results = search(store.all(), query, { limit, tags });
        if (results.length === 0) {
          return ok(`No memories found matching "${query}".`);
        }

        results.forEach(r => store.touch(r.memory.key));

        const lines = results.map((r, i) => {
          const m = r.memory;
          const tagStr = m.tags.length ? `[${m.tags.join(', ')}]` : '';
          return `${i + 1}. ${m.key}  (importance: ${m.importance}/10${tagStr ? '  ' + tagStr : ''})\n   ${m.content}`;
        });

        return ok(`Found ${results.length} result${results.length !== 1 ? 's' : ''} for "${query}":\n\n${lines.join('\n\n')}`);
      }

      // ── get_relevant_context ───────────────────────────────────────────────
      case 'get_relevant_context': {
        const userQuery = String(a['user_query'] ?? '').trim();
        if (!userQuery) return err('user_query is required');

        const results = search(store.all(), userQuery, { limit: 6 });
        if (results.length === 0) {
          return ok('No relevant memories found for this query. Memory is currently empty or no matches found.');
        }

        results.forEach(r => store.touch(r.memory.key));

        // Group by first tag for readability
        const groups = new Map<string, typeof results>();
        results.forEach(r => {
          const group = r.memory.tags[0] ?? 'general';
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group)!.push(r);
        });

        const sections: string[] = [];
        for (const [group, items] of groups) {
          const header = group.toUpperCase();
          const bullets = items.map(r => `• ${r.memory.key}: ${r.memory.content}`).join('\n');
          sections.push(`${header}:\n${bullets}`);
        }

        return ok(
          `Relevant context retrieved (${results.length} memories):\n\n${sections.join('\n\n')}`
        );
      }

      // ── update_memory ──────────────────────────────────────────────────────
      case 'update_memory': {
        const key = String(a['key'] ?? '').trim();
        if (!key) return err('key is required');

        const existing = store.byKey(key);
        if (!existing) return ok(`No memory found with key "${key}".`);

        const updates: Partial<Pick<Memory, 'content' | 'tags' | 'importance'>> = {};
        if (a['new_content'] !== undefined) updates.content = String(a['new_content']).trim();
        if (Array.isArray(a['tags'])) {
          updates.tags = autoTags(updates.content ?? existing.content, a['tags'] as string[]);
        }
        if (a['importance'] !== undefined) {
          updates.importance = autoImportance(updates.content ?? existing.content, Number(a['importance']));
        }

        const updated = store.update(key, updates);
        return ok(
          `Memory updated: ${key}\n` +
          `  Content:    ${updated!.content}\n` +
          `  Tags:       ${updated!.tags.join(', ') || '(none)'}\n` +
          `  Importance: ${updated!.importance}/10`
        );
      }

      // ── list_memories ──────────────────────────────────────────────────────
      case 'list_memories': {
        const tags = Array.isArray(a['tags']) ? (a['tags'] as string[]) : undefined;
        const limit = a['limit'] !== undefined ? Math.max(1, Number(a['limit'])) : 20;
        const sort = (a['sort'] as string | undefined) ?? 'recent';

        let memories = tags?.length
          ? store.all().filter(m => tags.some(t => m.tags.includes(t)))
          : store.all();

        memories = [...memories].sort((x, y) => {
          if (sort === 'importance') return y.importance - x.importance;
          if (sort === 'access') return y.accessCount - x.accessCount;
          return new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime();
        }).slice(0, limit);

        if (memories.length === 0) {
          return ok(tags?.length ? `No memories found with tags: ${tags.join(', ')}` : 'No memories stored yet.');
        }

        const lines = memories.map(m => {
          const tagStr = m.tags.length ? `  [${m.tags.join(', ')}]` : '';
          const preview = m.content.length > 100 ? m.content.slice(0, 100) + '…' : m.content;
          return `• ${m.key}  imp:${m.importance}/10${tagStr}\n  ${preview}`;
        });

        return ok(`${memories.length} memories (sorted by ${sort}):\n\n${lines.join('\n\n')}`);
      }

      // ── forget_memory ──────────────────────────────────────────────────────
      case 'forget_memory': {
        const key = String(a['key'] ?? '').trim();
        if (!key) return err('key is required');
        const deleted = store.remove(key);
        return ok(deleted ? `Memory deleted: "${key}"` : `Memory not found: "${key}"`);
      }

      // ── memory_summary ─────────────────────────────────────────────────────
      case 'memory_summary': {
        const stats = store.stats();

        if (stats.total === 0) {
          return ok(`Memory Hub is empty.\nStorage location: ${stats.storageFile}\n\nNo memories stored yet. Use store_memory to begin.`);
        }

        const topImportant = [...store.all()]
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 5)
          .map(m => `  • [${m.key}] (${m.importance}/10)  ${m.content.slice(0, 80)}${m.content.length > 80 ? '…' : ''}`)
          .join('\n');

        const tagList = stats.topTags.length
          ? stats.topTags.map(t => `  ${t.tag}: ${t.count}`).join('\n')
          : '  (none)';

        const accessList = stats.mostAccessed.length
          ? stats.mostAccessed.map(m => `  ${m.key} (${m.accessCount}×)`).join('\n')
          : '  (none)';

        return ok(
          `Memory Hub Summary\n` +
          `${'─'.repeat(40)}\n` +
          `Total memories:   ${stats.total}\n` +
          `Avg importance:   ${stats.avgImportance}/10\n` +
          `Storage:          ${stats.storageFile}\n` +
          `\nTop tags:\n${tagList}\n` +
          `\nMost important:\n${topImportant}\n` +
          `\nMost accessed:\n${accessList}`
        );
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

// ─── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
