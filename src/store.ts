import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Memory, MemoryFile, MemoryStats } from './types.js';

export const STORAGE_DIR = process.env.AGENT_MEMORY_DIR ?? join(homedir(), '.agent-memory');
export const STORE_FILE = join(STORAGE_DIR, 'memories.json');

const EMPTY_FILE = (): MemoryFile => ({
  version: '1.0.0',
  created: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  memories: [],
});

export class MemoryStore {
  private data: MemoryFile;

  constructor() {
    mkdirSync(STORAGE_DIR, { recursive: true });
    this.data = this.load();
  }

  private load(): MemoryFile {
    if (!existsSync(STORE_FILE)) return EMPTY_FILE();
    try {
      return JSON.parse(readFileSync(STORE_FILE, 'utf-8')) as MemoryFile;
    } catch {
      return EMPTY_FILE();
    }
  }

  private persist(): void {
    this.data.lastUpdated = new Date().toISOString();
    const json = JSON.stringify(this.data, null, 2);
    // Atomic write: write to temp file, then rename to prevent corruption
    const tmp = join(tmpdir(), `agent-memory-${Date.now()}.tmp`);
    writeFileSync(tmp, json, 'utf-8');
    renameSync(tmp, STORE_FILE);
  }

  all(): Memory[] {
    return this.data.memories;
  }

  byKey(key: string): Memory | undefined {
    return this.data.memories.find(m => m.key === key);
  }

  add(partial: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessed'>): Memory {
    if (this.byKey(partial.key)) {
      throw new Error(`Memory key "${partial.key}" already exists — use update_memory to modify it.`);
    }
    const now = new Date().toISOString();
    const memory: Memory = { ...partial, id: randomUUID(), createdAt: now, updatedAt: now, accessCount: 0, lastAccessed: now };
    this.data.memories.push(memory);
    this.persist();
    return memory;
  }

  upsert(partial: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessed'>): { memory: Memory; created: boolean } {
    const existing = this.byKey(partial.key);
    if (existing) {
      const updated = this.update(partial.key, {
        content: partial.content,
        tags: partial.tags,
        importance: partial.importance,
      })!;
      return { memory: updated, created: false };
    }
    const now = new Date().toISOString();
    const memory: Memory = { ...partial, id: randomUUID(), createdAt: now, updatedAt: now, accessCount: 0, lastAccessed: now };
    this.data.memories.push(memory);
    this.persist();
    return { memory, created: true };
  }

  update(key: string, updates: Partial<Pick<Memory, 'content' | 'tags' | 'importance'>>): Memory | null {
    const idx = this.data.memories.findIndex(m => m.key === key);
    if (idx === -1) return null;
    this.data.memories[idx] = { ...this.data.memories[idx], ...updates, updatedAt: new Date().toISOString() };
    this.persist();
    return this.data.memories[idx];
  }

  remove(key: string): boolean {
    const before = this.data.memories.length;
    this.data.memories = this.data.memories.filter(m => m.key !== key);
    if (this.data.memories.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  touch(key: string): void {
    const mem = this.data.memories.find(m => m.key === key);
    if (mem) {
      mem.accessCount++;
      mem.lastAccessed = new Date().toISOString();
      this.persist();
    }
  }

  stats(): MemoryStats {
    const mems = this.data.memories;
    const tagFreq: Record<string, number> = {};
    mems.forEach(m => m.tags.forEach(t => { tagFreq[t] = (tagFreq[t] ?? 0) + 1; }));

    return {
      total: mems.length,
      storageFile: STORE_FILE,
      topTags: Object.entries(tagFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count })),
      avgImportance: mems.length
        ? (mems.reduce((a, m) => a + m.importance, 0) / mems.length).toFixed(1)
        : '0.0',
      mostAccessed: [...mems]
        .sort((a, b) => b.accessCount - a.accessCount)
        .slice(0, 3)
        .map(m => ({ key: m.key, accessCount: m.accessCount })),
      newest: mems.length > 0 ? mems[mems.length - 1].key : null,
    };
  }
}
