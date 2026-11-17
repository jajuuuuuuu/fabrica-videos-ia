import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadStore } from './store.js';
import { handleApi } from './api.js';
const root=join(fileURLToPath(new URL('../../public/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
// Carga mínima de .env sin dependencia externa; nunca se sirve como archivo estático.
try { const raw = await readFile(join(process.cwd(), '.env'), 'utf8'); for (const line of raw.split(/\r?\n/)) { const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); } } catch {}
await loadStore();
const rate=new Map();
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  const ip=req.socket.remoteAddress||'unknown';const now=Date.now();const bucket=rate.get(ip)||{start:now,count:0};if(now-bucket.start>60000){bucket.start=now;bucket.count=0;}bucket.count++;rate.set(ip,bucket);if(bucket.count>180){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'60'});return res.end(JSON.stringify({error:'Demasiadas solicitudes. Espera un minuto.'}));}if(rate.size>5000)for(const [key,value] of rate)if(now-value.start>120000)rate.delete(key);
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')) return handleApi(req,res,url);
  if(url.pathname.startsWith('/media/')) {
    const base=resolve(process.cwd(),'data','media'); const file=resolve(base,decodeURIComponent(url.pathname.slice(7)));
    if(!file.startsWith(base+ '\\') && !file.startsWith(base+'/')) { res.writeHead(403); return res.end('Forbidden'); }
    try { const data=await readFile(file); const ext=extname(file); const mediaTypes={'.png':'image/png','.mp3':'audio/mpeg','.srt':'text/plain; charset=utf-8','.mp4':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.aac':'audio/aac'}; res.writeHead(200,{'Content-Type':mediaTypes[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}); return res.end(data); } catch { res.writeHead(404); return res.end('No encontrado'); }
  }
  let path=normalize(decodeURIComponent(url.pathname)); if(path==='/'||path==='\\') path='/index.html';
  if(path.includes('..')){res.writeHead(403);return res.end('Forbidden');}
  const file=join(root,path);
  try{await stat(file);const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache'});res.end(data);}
  catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('No encontrado');}
});
const port=Number(process.env.PORT||3030);server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Fábrica de Vídeos IA lista en http://localhost:${port}`));
