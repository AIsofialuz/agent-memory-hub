/**
 * Self-contained integration tests — uses Node's built-in assert, no test framework needed.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Isolate storage to a temp dir so tests never touch real memories ──────────
const TEST_DIR = mkdtempSync(join(tmpdir(), 'agent-memory-test-'));
process.env['AGENT_MEMORY_DIR'] = TEST_DIR;

// Import AFTER setting env var so MemoryStore picks up TEST_DIR
const { MemoryStore } = await import('./store.js');
const { search } = await import('./search.js');
const { autoTags, autoImportance } = await import('./auto.js');

// ── Tiny test harness ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
    failed++;
  }
}

// ── auto.ts ───────────────────────────────────────────────────────────────────
console.log('\nauto.ts');

test('autoTags detects preference signal', () => {
  const tags = autoTags('I prefer TypeScript over JavaScript', []);
  assert.ok(tags.includes('preference'), `got: ${tags}`);
});

test('autoTags merges provided + inferred tags', () => {
  const tags = autoTags('I prefer TypeScript', ['custom']);
  assert.ok(tags.includes('preference'));
  assert.ok(tags.includes('custom'));
});

test('autoTags dedups case-insensitively', () => {
  const tags = autoTags('I prefer TypeScript', ['Preference']);
  assert.equal(tags.filter(t => t === 'preference').length, 1);
});

test('autoImportance uses provided value (clamped)', () => {
  assert.equal(autoImportance('anything', 15), 10);
  assert.equal(autoImportance('anything', 0), 1);
  assert.equal(autoImportance('anything', 7), 7);
});

test('autoImportance detects critical keywords', () => {
  assert.ok(autoImportance('This is critical and must not change') >= 8);
});

test('autoImportance defaults to 5 for neutral content', () => {
  assert.equal(autoImportance('The sky is blue'), 5);
});

// ── store.ts ──────────────────────────────────────────────────────────────────
console.log('\nstore.ts');

const store = new MemoryStore();

test('add creates a memory', () => {
  const m = store.add({ key: 'lang', content: 'TypeScript', tags: ['technical'], importance: 7 });
  assert.equal(m.key, 'lang');
  assert.equal(m.accessCount, 0);
});

test('add rejects duplicate key', () => {
  assert.throws(
    () => store.add({ key: 'lang', content: 'duplicate', tags: [], importance: 5 }),
    /already exists/
  );
});

test('byKey finds existing memory', () => {
  const m = store.byKey('lang');
  assert.ok(m);
  assert.equal(m!.content, 'TypeScript');
});

test('byKey returns undefined for missing key', () => {
  assert.equal(store.byKey('nonexistent'), undefined);
});

test('update modifies content', () => {
  const updated = store.update('lang', { content: 'TypeScript 5' });
  assert.equal(updated!.content, 'TypeScript 5');
});

test('touch increments accessCount', () => {
  store.touch('lang');
  assert.equal(store.byKey('lang')!.accessCount, 1);
});

// ── upsert ────────────────────────────────────────────────────────────────────
console.log('\nstore.ts — upsert (v1.1.0)');

test('upsert creates when key is new', () => {
  const { memory, created } = store.upsert({ key: 'new_key', content: 'Hello', tags: [], importance: 5 });
  assert.ok(created);
  assert.equal(memory.key, 'new_key');
  assert.equal(memory.content, 'Hello');
});

test('upsert updates when key exists', () => {
  const { memory, created } = store.upsert({ key: 'new_key', content: 'Updated!', tags: ['note'], importance: 8 });
  assert.equal(created, false);
  assert.equal(memory.content, 'Updated!');
  assert.equal(memory.importance, 8);
  assert.ok(memory.tags.includes('note'));
});

test('upsert preserves createdAt timestamp', () => {
  const original = store.byKey('new_key')!.createdAt;
  store.upsert({ key: 'new_key', content: 'Again', tags: [], importance: 5 });
  assert.equal(store.byKey('new_key')!.createdAt, original);
});

test('remove deletes a memory', () => {
  const ok = store.remove('new_key');
  assert.ok(ok);
  assert.equal(store.byKey('new_key'), undefined);
});

test('remove returns false for missing key', () => {
  assert.equal(store.remove('ghost'), false);
});

test('stats reflects current state', () => {
  const s = store.stats();
  assert.ok(s.total >= 1);
  assert.ok(typeof s.avgImportance === 'string');
});

// ── search.ts ─────────────────────────────────────────────────────────────────
console.log('\nsearch.ts');

store.add({ key: 'framework', content: 'Uses React for the frontend UI components', tags: ['technical'], importance: 6 });
store.add({ key: 'deadline', content: 'Project deadline is end of June 2025', tags: ['task'], importance: 9 });
store.add({ key: 'note_misc', content: 'Random unrelated content about pizza', tags: ['note'], importance: 2 });

test('search finds relevant memory', () => {
  const results = search(store.all(), 'typescript language');
  assert.ok(results.length > 0);
  assert.ok(results.some(r => r.memory.key === 'lang'));
});

test('search ranks by relevance (deadline should beat pizza for "project")', () => {
  const results = search(store.all(), 'project deadline');
  assert.ok(results.length > 0);
  assert.equal(results[0].memory.key, 'deadline');
});

test('search tag filter narrows results', () => {
  const results = search(store.all(), 'deadline', { tags: ['technical'] });
  assert.ok(results.every(r => r.memory.tags.includes('technical')));
});

test('search returns empty for no match', () => {
  const results = search(store.all(), 'xyzzy frobnicator');
  assert.equal(results.length, 0);
});

test('search respects limit', () => {
  const results = search(store.all(), 'content', { limit: 1 });
  assert.ok(results.length <= 1);
});

// ── Cleanup & summary ─────────────────────────────────────────────────────────
rmSync(TEST_DIR, { recursive: true, force: true });

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
