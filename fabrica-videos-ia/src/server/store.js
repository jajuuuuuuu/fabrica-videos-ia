import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
const DATA = join(process.cwd(), 'data');
const FILE = join(DATA, 'store.json');
const initial = { productions: [], events: [], characters: [], settings: { publishMode: 'manual' } };
let state = structuredClone(initial);
export async function loadStore() {
  await mkdir(DATA, { recursive: true });
  try { const saved = JSON.parse(await readFile(FILE, 'utf8')); state = { ...initial, ...saved, characters: saved.characters || [] }; }
  catch { await persist(); }
  return state;
}
export function getStore() { return state; }
export async function persist() {
  await mkdir(DATA, { recursive: true });
  const tmp = FILE + '.' + crypto.randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(tmp, FILE);
}
export async function logEvent(type, message, productionId = null, level = 'info') {
  state.events.unshift({ id: crypto.randomUUID(), type, message, productionId, level, createdAt: new Date().toISOString() });
  state.events = state.events.slice(0, 300);
  await persist();
}
