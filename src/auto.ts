// Category signals for automatic tag inference
const SIGNALS: Record<string, string[]> = {
  preference: ['prefer', 'like', 'love', 'hate', 'dislike', 'favorite', 'enjoy', 'avoid', "don't use", 'always use'],
  project: ['project', 'working on', 'building', 'developing', 'implementing', 'creating', 'repository', 'repo'],
  identity: ['i am', "i'm", 'my name', 'user is', 'i work', 'i live', 'my job', 'i study', 'my role'],
  technical: ['code', 'function', 'api', 'database', 'server', 'library', 'framework', 'git', 'docker', 'typescript', 'python'],
  task: ['todo', 'task', 'need to', 'must', 'should', 'will', 'deadline', 'remind', 'by tomorrow', 'by friday'],
  credential: ['password', 'secret', 'api key', 'token', 'credential', 'login', 'auth'],
  note: ['note', 'remember that', 'fyi', 'heads up', 'keep in mind', 'just learned'],
  person: ['name is', 'called', 'email', 'phone', 'address', 'contact', 'colleague', 'client'],
  config: ['config', 'setting', 'environment', 'env var', 'port', 'host', 'url', 'endpoint'],
};

export function autoTags(content: string, provided: string[]): string[] {
  const lower = content.toLowerCase();
  const tags = new Set(provided.map(t => t.toLowerCase().trim()).filter(Boolean));

  for (const [category, signals] of Object.entries(SIGNALS)) {
    if (signals.some(s => lower.includes(s))) {
      tags.add(category);
    }
  }

  return Array.from(tags);
}

export function autoImportance(content: string, provided?: number): number {
  if (provided !== undefined) return Math.max(1, Math.min(10, Math.round(provided)));

  const lower = content.toLowerCase();
  if (/\b(password|secret|token|api.?key|credential)\b/.test(lower)) return 9;
  if (/\b(critical|urgent|never|always|must|required|important)\b/.test(lower)) return 8;
  if (/\b(remember|key fact|note that)\b/.test(lower)) return 7;
  if (/\b(prefer|like|enjoy|use|work with)\b/.test(lower)) return 6;
  if (/\b(maybe|sometimes|usually|often|generally)\b/.test(lower)) return 4;
  if (/\b(fyi|info|heads up|notice)\b/.test(lower)) return 3;

  return 5;
}
