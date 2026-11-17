import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getStore, persist, logEvent } from './store.js';
import { generateSceneImage, generateNarration, generateThumbnail } from '../providers/openai-media.js';
import { renderProduction } from '../media/render.js';
const root = join(process.cwd(),'data','media');
const busy = new Set();
function find(id){return getStore().productions.find(p=>p.id===id)}
export function startAssetGeneration(id){
  const p=find(id); if(!p) return null; if(busy.has(id)) return p;
  if(!p.script?.scenes?.length) throw new Error('Primero necesitas generar el guion.');
  busy.add(id); generate(id).catch(async e=>{const item=find(id);if(item){item.mediaStatus='failed';item.errors.push({stage:'Recursos audiovisuales',message:e.message,at:new Date().toISOString()});await logEvent('media_failed',e.message,id,'error');await persist();}}).finally(()=>busy.delete(id)); return p;
}
async function generate(id){
  const p=find(id); const dir=join(root,id); await mkdir(dir,{recursive:true}); p.mediaStatus='generating';p.mediaAssets=[];await persist();
  for(let i=0;i<p.script.scenes.length;i++){
    const scene=p.script.scenes[i]; const file=join(dir,`scene-${i+1}.png`);
    const characterPrompt=p.character?`PERSONAJE PRINCIPAL FIJO: ${p.character.name}. Apariencia exacta que debe mantenerse idéntica en todas las escenas: ${p.character.appearance}. No cambies rostro, edad aparente, ropa, colores, proporciones ni accesorios. ${p.character.negativePrompt?`Evitar: ${p.character.negativePrompt}.`:''}`:'Mantén continuidad visual con el mismo protagonista en todas las escenas.';
    await generateSceneImage(`${p.style}. ${characterPrompt} Escena ${i+1}: ${scene.visual}`,file);
    p.mediaAssets.push({type:'image',scene:i+1,url:`/media/${id}/scene-${i+1}.png`,status:'ready'});await persist();
  }
  const narrationText=p.script.scenes.map((s,i)=>`Escena ${i+1}. ${s.narration}`).join('\n');
  await generateNarration(narrationText,join(dir,'narration.mp3'));
  p.mediaAssets.push({type:'audio',label:'Narración completa',url:`/media/${id}/narration.mp3`,status:'ready'});
  p.mediaAssets.push({type:'subtitles',label:'Subtítulos SRT',url:`/media/${id}/subtitles.srt`,status:'pending_render'});
  p.mediaStatus='ready_to_render'; await logEvent('media_ready','Imágenes de escenas y narración generadas',id);await persist();
}
export async function renderJob(id){
  const p=find(id);if(!p)return null;if(busy.has(id))throw new Error('Ya hay una tarea ejecutándose para esta producción.');
  if(p.mediaStatus!=='ready_to_render'&&p.mediaStatus!=='render_failed')throw new Error('Genera primero las imágenes y la narración.');
  busy.add(id);p.mediaStatus='rendering';await persist();
  try{const result=await renderProduction(p,join(root,id),join(root,id,'output'));p.video={url:`/media/${id}/output/${id}.mp4`,durationSeconds:result.durationSeconds,resolution:result.resolution,qualityCheck:result.qualityCheck,transitionSeconds:result.transitionSeconds,createdAt:new Date().toISOString()};p.mediaStatus='rendered';const sub=p.mediaAssets.find(a=>a.type==='subtitles');if(sub)sub.status='ready';await logEvent('render_completed','Vídeo MP4 renderizado con FFmpeg',id);return p;}
  catch(e){p.mediaStatus='render_failed';p.errors.push({stage:'Renderizado FFmpeg',message:e.message,at:new Date().toISOString()});await logEvent('render_failed',e.message,id,'error');throw e;}
  finally{busy.delete(id);await persist();}
}

export async function createThumbnail(id) {
  const p=find(id); if(!p) return null;
  if(busy.has(id)) throw new Error('Hay otra tarea ejecutándose para esta producción.');
  if(!process.env.OPENAI_API_KEY) throw new Error('Conecta OpenAI para generar la miniatura.');
  busy.add(id);
  try {
    const dir=join(root,id); await mkdir(dir,{recursive:true});
    const subject=p.script?.title || p.idea;
    const characterPrompt=p.character?`Personaje protagonista ${p.character.name}: ${p.character.appearance}. Conserva exactamente su diseño.`:'';
    await generateThumbnail(`${p.style}. ${characterPrompt} Tema: ${subject}. Idea original: ${p.idea}`,join(dir,'thumbnail.png'));
    p.thumbnail={url:`/media/${id}/thumbnail.png`,createdAt:new Date().toISOString(),status:'ready'};
    await logEvent('thumbnail_ready','Miniatura generada',id); await persist(); return p;
  } catch(e) { p.errors.push({stage:'Miniatura',message:e.message,at:new Date().toISOString()}); await logEvent('thumbnail_failed',e.message,id,'error'); await persist(); throw e; }
  finally { busy.delete(id); }
}

import { createRunwayClip } from '../providers/runway.js';
import { access } from 'node:fs/promises';
export async function startVideoClipGeneration(id){
  const p=find(id);if(!p)return null;if(busy.has(id))throw new Error('Ya hay otra tarea ejecutándose para esta producción.');
  if(!process.env.RUNWAYML_API_SECRET)throw new Error('Configura RUNWAYML_API_SECRET en el archivo .env para usar Runway.');
  if(!p.script?.scenes?.length)throw new Error('Primero genera el guion.');
  for(let i=0;i<p.script.scenes.length;i++){try{await access(join(root,id,`scene-${i+1}.png`))}catch{throw new Error('Primero genera las imágenes de todas las escenas.')}}
  busy.add(id);p.clipStatus='generating';p.clipProgress=0;await persist();
  generateClips(id).catch(async e=>{const item=find(id);if(item){item.clipStatus='failed';item.errors.push({stage:'Clips IA Runway',message:e.message,at:new Date().toISOString()});await logEvent('clips_failed',e.message,id,'error');await persist();}}).finally(()=>busy.delete(id));
  return p;
}
async function generateClips(id){
  const p=find(id),dir=join(root,id);await mkdir(dir,{recursive:true});
  for(let i=0;i<p.script.scenes.length;i++){
    const image=join(dir,`scene-${i+1}.png`);const prompt=`${p.style}. Animate this exact scene naturally: ${p.script.scenes[i].visual}. Preserve the identity, face, clothes, colors and proportions of the reference character. Smooth cinematic camera movement, coherent motion, no cuts, no text, no logos.`;
    const ratio=p.format==='long'?'1280:720':'720:1280';
    const result=await createRunwayClip({imagePath:image,prompt,destination:join(dir,`clip-${i+1}.mp4`),ratio,duration:5});
    p.clipProgress=i+1;p.clipTasks=p.clipTasks||[];p.clipTasks.push({scene:i+1,taskId:result.taskId,model:result.model,status:'ready',url:`/media/${id}/clip-${i+1}.mp4`});await persist();
  }
  p.clipStatus='ready';await logEvent('clips_ready',`${p.clipTasks.length} clips generados con Runway`,id);await persist();
}
