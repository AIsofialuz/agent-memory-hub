export interface Memory {
  id: string;
  key: string;
  content: string;
  tags: string[];
  importance: number; // 1-10
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessed: string;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  matchType: 'keyword' | 'exact';
}

export interface MemoryFile {
  version: string;
  created: string;
  lastUpdated: string;
  memories: Memory[];
}

export interface MemoryStats {
  total: number;
  storageFile: string;
  topTags: Array<{ tag: string; count: number }>;
  avgImportance: string;
  mostAccessed: Array<{ key: string; accessCount: number }>;
  newest: string | null;
}
