import { getStore, persist, logEvent } from './store.js';
import { generateScript } from '../providers/openai.js';
const stages = [
  ['research','Investigación'],['script','Guion'],['visual','Dirección visual'],['voice','Voces'],['sound','Música y sonido'],['edit','Edición'],['quality','Control de calidad'],['thumbnail','Miniatura'],['metadata','Metadatos']
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function createProduction({ idea, format = 'short', style = 'Animación 3D cinematográfica', characterId = '' }) {
  const character = (getStore().characters||[]).find(c=>c.id===characterId) || null;
  const item = { id: crypto.randomUUID(), idea, format, style, characterId: character?.id || null, character: character ? { ...character } : null, status: 'queued', progress: 0, currentStage: 'Preparando', stages: stages.map(([id,label]) => ({ id,label,status:'pending' })), createdAt: new Date().toISOString(), script: null, errors: [], assets: [], publish: { status: 'not_authorized' } };
  getStore().productions.unshift(item); await persist();
  runProduction(item.id);
  return item;
}
async function runProduction(id) {
  const store = getStore(); const p = store.productions.find(x => x.id === id); if (!p) return;
  p.status = 'running'; await persist();
  try {
    for (let i = 0; i < stages.length; i++) {
      const [stageId, label] = stages[i]; p.currentStage = label; p.stages[i].status = 'running'; await persist();
      if (stageId === 'script') {
        let attempt = 0;
        while (true) {
          try { const result = await generateScript(p.idea, p.format); p.script = result.script; p.scriptSource = result.source; break; }
          catch (e) { attempt++; p.errors.push({ stage: label, message: e.message, at: new Date().toISOString() }); await logEvent('retry', `Error en guion, intento ${attempt}: ${e.message}`, id, 'warning'); if (attempt >= 2) throw e; await sleep(1000 * attempt); }
        }
      }
      if (stageId === 'research') p.research = { status: 'pending_integration', note: 'Conecta fuentes autorizadas para obtener tendencias y estadísticas reales. No se muestran métricas inventadas.' };
      if (['visual','voice','sound','edit','quality','thumbnail'].includes(stageId)) p.stages[i].note = 'Planificado; requiere proveedor/worker conectado.';
      if (stageId === 'metadata' && p.script) p.metadata = { title: p.script.title, description: p.script.description, tags: p.script.tags || [], status: 'draft' };
      p.stages[i].status = 'completed'; p.progress = Math.round(((i + 1) / stages.length) * 100); await persist();
      await logEvent('stage_completed', `${label} completado`, id);
      await sleep(120);
    }
    p.status = 'awaiting_assets'; p.currentStage = 'Revisión y conexiones';
    await logEvent('production_ready', 'Plan y guion preparados. La generación audiovisual y publicación requieren integraciones reales.', id);
  } catch (e) {
    p.status = 'failed'; p.currentStage = 'Error'; p.errors.push({ stage: p.currentStage, message: e.message, at: new Date().toISOString() });
    await logEvent('production_failed', e.message, id, 'error');
  }
  await persist();
}
export async function retryProduction(id) {
  const p = getStore().productions.find(x => x.id === id); if (!p) return null;
  if (p.status === 'running') return p;
  p.status = 'queued'; p.errors = []; p.stages = stages.map(s => ({id:s[0],label:s[1],status:'pending'})); p.progress = 0; p.script = null;
  await persist(); runProduction(id); return p;
}
