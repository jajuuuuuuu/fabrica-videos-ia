import { getStore, persist, logEvent } from './store.js';
import { createProduction, retryProduction } from './queue.js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startAssetGeneration, renderJob, createThumbnail, startVideoClipGeneration } from './media-jobs.js';
import { saveAudioTrack } from './audio.js';
import { youtubeConfigured, youtubeAuthUrl, youtubeCallback, youtubeStatus, uploadToYouTube, channelAnalytics, trendingChile } from '../providers/youtube.js';
const send = (res, code, data) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(data)); };
async function body(req) { let s=''; for await (const c of req) { s+=c; if(s.length>12_000_000) throw new Error('Solicitud demasiado grande'); } return s ? JSON.parse(s) : {}; }
function integrations() {
  const configured = (v) => Boolean(process.env[v]);
  return [
    {id:'openai',name:'OpenAI',category:'Guion, imagen y voz',status:configured('OPENAI_API_KEY')?'configured':'missing_key',features:['Guiones','Imágenes','Narración'],model:process.env.OPENAI_MODEL||'gpt-4.1-mini',env:'OPENAI_API_KEY'},
    {id:'claude',name:'Anthropic Claude',category:'Guion e IA',status:'not_implemented',features:['Guiones'],env:'ANTHROPIC_API_KEY'},
    {id:'gemini',name:'Google Gemini',category:'Guion e IA',status:configured('GEMINI_API_KEY')?'configured':'missing_key',features:['Texto'],env:'GEMINI_API_KEY'},
    {id:'runway',name:'Runway',category:'Vídeo IA',status:configured('RUNWAYML_API_SECRET')?'configured':'missing_key',features:['Imagen a vídeo','Clips animados'],model:process.env.RUNWAY_MODEL||'gen4_turbo',env:'RUNWAYML_API_SECRET'},
    {id:'veo',name:'Google Flow / Veo',category:'Vídeo',status:'not_implemented',features:['Generación de vídeo'],env:'GOOGLE_CLOUD_PROJECT'},
    {id:'elevenlabs',name:'ElevenLabs',category:'Audio',status:configured('ELEVENLABS_API_KEY')?'configured':'missing_key',features:['Voces'],env:'ELEVENLABS_API_KEY'},
    {id:'youtube',name:'YouTube',category:'Publicación',status:youtubeStatus().connected?'configured':youtubeConfigured()?'credentials_set':'not_connected',features:['OAuth','Subida privada/pública','Analytics'],env:'YOUTUBE_CLIENT_ID'},
    {id:'trends',name:'Google Trends',category:'Investigación',status:'not_implemented',features:['Tendencias'],env:null},
    {id:'canva',name:'Canva',category:'Diseño',status:'not_implemented',features:['Diseño de miniaturas'],env:null}
  ];
}
export async function handleApi(req,res,url) {
  try {
    if (req.method==='GET' && url.pathname==='/api/health') return send(res,200,{ok:true,version:'1.0.0',time:new Date().toISOString(),security:{host:process.env.HOST||'127.0.0.1',httpsRequiredInProduction:process.env.NODE_ENV==='production'}});
    if (req.method==='GET' && url.pathname==='/api/dashboard') {
      const s=getStore(); const productions=s.productions;
      return send(res,200,{stats:{total:productions.length,active:productions.filter(p=>p.status==='running'||p.status==='queued').length,ready:productions.filter(p=>p.status==='awaiting_assets').length,published:productions.filter(p=>p.publish?.status==='published').length},productions:productions.slice(0,12),events:s.events.slice(0,10),characters:s.characters||[],integrations:integrations()});
    }
    if(req.method==='GET'&&url.pathname==='/api/youtube/status') return send(res,200,youtubeStatus());
    if(req.method==='POST'&&url.pathname==='/api/youtube/auth-url'){try{return send(res,200,{url:await youtubeAuthUrl()})}catch(e){return send(res,400,{error:e.message})}}
    if(req.method==='GET'&&url.pathname==='/api/oauth/youtube/callback'){
      const err=url.searchParams.get('error');if(err){res.writeHead(400,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<h2>No se pudo conectar YouTube</h2><p>${String(err).replace(/[<>]/g,'')}</p><p>Puedes cerrar esta pestaña.</p>`)}
      try{await youtubeCallback(url.searchParams.get('code'),url.searchParams.get('state'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end('<h2>¡YouTube conectado!</h2><p>La autorización quedó guardada en Fábrica de Vídeos IA. Puedes cerrar esta pestaña y volver a la aplicación.</p>')}catch(e){res.writeHead(400,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<h2>Error de conexión</h2><p>${String(e.message).replace(/[<>]/g,'')}</p>`)}}
    if(req.method==='POST'&&url.pathname==='/api/youtube/analytics'){try{return send(res,200,await channelAnalytics((await body(req)).days))}catch(e){return send(res,400,{error:e.message})}}
    if(req.method==='GET'&&url.pathname==='/api/trends/chile'){try{return send(res,200,await trendingChile())}catch(e){return send(res,502,{error:`No se pudieron cargar tendencias reales: ${e.message}`})}}
    const uploadMatch=url.pathname.match(/^\/api\/productions\/([\w-]+)\/youtube-upload$/);
    if(req.method==='POST'&&uploadMatch){try{const b=await body(req);const privacy=['private','unlisted','public'].includes(b.privacyStatus)?b.privacyStatus:'private';return send(res,200,{publish:await uploadToYouTube(uploadMatch[1],{privacyStatus:privacy})})}catch(e){return send(res,400,{error:e.message})}}
    if (req.method==='GET' && url.pathname==='/api/integrations') return send(res,200,{items:integrations()});
    if (req.method==='GET' && url.pathname==='/api/characters') return send(res,200,{items:getStore().characters||[]});
    if (req.method==='POST' && url.pathname==='/api/characters') {
      const b=await body(req); const name=String(b.name||'').trim(); const appearance=String(b.appearance||'').trim();
      if(name.length<2||appearance.length<10) return send(res,400,{error:'Escribe un nombre y una apariencia de al menos 10 caracteres.'});
      if(name.length>60||appearance.length>1200) return send(res,400,{error:'El nombre o la descripción son demasiado largos.'});
      const item={id:crypto.randomUUID(),name,appearance,voiceNotes:String(b.voiceNotes||'').slice(0,500),negativePrompt:String(b.negativePrompt||'').slice(0,500),createdAt:new Date().toISOString()};
      getStore().characters.unshift(item); await persist(); await logEvent('character_created',`Personaje creado: ${name}`); return send(res,201,{item});
    }
    const characterMatch=url.pathname.match(/^\/api\/characters\/([\w-]+)$/);
    if(req.method==='DELETE'&&characterMatch){const s=getStore();const index=(s.characters||[]).findIndex(c=>c.id===characterMatch[1]);if(index<0)return send(res,404,{error:'Personaje no encontrado'});s.characters.splice(index,1);await persist();return send(res,200,{ok:true});}
    const audioMatch=url.pathname.match(/^\/api\/productions\/([\w-]+)\/audio$/);
    if(req.method==='POST'&&audioMatch){const b=await body(req);try{const item=await saveAudioTrack(audioMatch[1],b);return send(res,200,{item,message:'Pista de audio guardada.'});}catch(e){return send(res,400,{error:e.message});}}
    if (req.method==='GET' && url.pathname==='/api/productions') return send(res,200,{items:getStore().productions});
    if (req.method==='POST' && url.pathname==='/api/productions') {
      const b=await body(req); if(typeof b.idea!=='string'||b.idea.trim().length<8) return send(res,400,{error:'Escribe una idea de al menos 8 caracteres.'});
      if(b.idea.length>2000) return send(res,400,{error:'La idea supera los 2.000 caracteres.'});
      const p=await createProduction({idea:b.idea.trim(),format:b.format==='long'?'long':'short',style:String(b.style||'Animación 3D cinematográfica').slice(0,100),characterId:String(b.characterId||'')});
      await logEvent('idea_received','Nueva idea recibida',p.id); return send(res,201,{item:p});
    }
    const mediaMatch=url.pathname.match(/^\/api\/productions\/([\w-]+)\/(generate-assets|render|thumbnail|generate-clips)$/);
    if(req.method==='POST'&&mediaMatch){
      const id=mediaMatch[1];
      if(mediaMatch[2]==='generate-clips'){try{const p=await startVideoClipGeneration(id);return p?send(res,202,{item:p,message:'Generación de clips iniciada en Runway.'}):send(res,404,{error:'Producción no encontrada'});}catch(e){return send(res,400,{error:e.message});}}
      if(mediaMatch[2]==='thumbnail'){try{const p=await createThumbnail(id);return p?send(res,200,{item:p,message:'Miniatura generada.'}):send(res,404,{error:'Producción no encontrada'});}catch(e){return send(res,400,{error:e.message});}}
      if(mediaMatch[2]==='generate-assets'){
        if(!process.env.OPENAI_API_KEY)return send(res,400,{error:'Conecta OpenAI antes de generar imágenes y narración.'});
        const p=startAssetGeneration(id);return p?send(res,202,{item:p,message:'Generación de imágenes y narración iniciada.'}):send(res,404,{error:'Producción no encontrada'});
      }
      try{const p=await renderJob(id);return p?send(res,200,{item:p,message:'Vídeo MP4 renderizado.'}):send(res,404,{error:'Producción no encontrada'});}catch(e){return send(res,400,{error:e.message});}
    }
    const match=url.pathname.match(/^\/api\/productions\/([\w-]+)$/);
    if(req.method==='GET'&&match){const p=getStore().productions.find(x=>x.id===match[1]);return p?send(res,200,{item:p}):send(res,404,{error:'Producción no encontrada'});}
    const retry=url.pathname.match(/^\/api\/productions\/([\w-]+)\/retry$/);
    if(req.method==='POST'&&retry){const p=await retryProduction(retry[1]);return p?send(res,200,{item:p}):send(res,404,{error:'Producción no encontrada'});}
    if(req.method==='POST'&&url.pathname==='/api/settings/runway'){
      const b=await body(req);if(typeof b.apiKey!=='string'||b.apiKey.trim().length<20)return send(res,400,{error:'La clave de Runway parece incompleta.'});
      const envPath=resolve(process.cwd(),'.env');let contents='';try{contents=await readFile(envPath,'utf8')}catch{}
      const lines=contents.split(/\r?\n/).filter(line=>!line.startsWith('RUNWAYML_API_SECRET=')&&!line.startsWith('RUNWAY_MODEL='));lines.push(`RUNWAYML_API_SECRET=${b.apiKey.trim().replace(/[\r\n]/g,'')}`);lines.push(`RUNWAY_MODEL=${String(b.model||'gen4_turbo').replace(/[^a-zA-Z0-9_.-]/g,'')}`);
      await writeFile(envPath,lines.filter(Boolean).join('\n')+'\n',{mode:0o600});process.env.RUNWAYML_API_SECRET=b.apiKey.trim();process.env.RUNWAY_MODEL=String(b.model||'gen4_turbo');await logEvent('integration_configured','Clave de Runway guardada en .env');return send(res,200,{ok:true,message:'Clave de Runway guardada en el servidor.'});
    }
    if(req.method==='POST'&&url.pathname==='/api/settings/openai'){
      const b=await body(req); if(typeof b.apiKey!=='string'||b.apiKey.trim().length<20) return send(res,400,{error:'La clave parece incompleta.'});
      const envPath=resolve(process.cwd(),'.env'); let contents=''; try{contents=await readFile(envPath,'utf8');}catch{}
      const lines=contents.split(/\r?\n/).filter(line=>!line.startsWith('OPENAI_API_KEY=')); lines.push(`OPENAI_API_KEY=${b.apiKey.trim().replace(/[\r\n]/g,'')}`);
      await writeFile(envPath,lines.filter(Boolean).join('\n')+'\n',{mode:0o600}); process.env.OPENAI_API_KEY=b.apiKey.trim();
      await logEvent('integration_configured','Clave de OpenAI guardada en .env'); return send(res,200,{ok:true,message:'Clave guardada en el servidor. No se vuelve a mostrar.'});
    }
    if(req.method==='POST'&&url.pathname==='/api/publish/authorize') return send(res,410,{error:'Usa /api/youtube/auth-url para iniciar OAuth de YouTube.'});
    return send(res,404,{error:'Ruta API no encontrada'});
  } catch(e) { return send(res,500,{error:e.message||'Error interno'}); }
}
