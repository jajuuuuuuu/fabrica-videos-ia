import { join, extname } from 'node:path';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { getStore, persist, logEvent } from './store.js';
const root=join(process.cwd(),'data','media');
const allowed={mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',ogg:'audio/ogg',aac:'audio/aac'};
export async function saveAudioTrack(id,{kind,filename,dataBase64}){
  const p=getStore().productions.find(x=>x.id===id);if(!p)throw new Error('Producción no encontrada.');
  if(!['music','effects'].includes(kind))throw new Error('Tipo de audio no válido.');
  if(typeof dataBase64!=='string'||dataBase64.length>11_200_000)throw new Error('El archivo supera el límite de 8 MB.');
  const ext=extname(String(filename||'')).slice(1).toLowerCase();if(!allowed[ext])throw new Error('Formato no admitido. Usa MP3, WAV, M4A, OGG o AAC.');
  const data=Buffer.from(dataBase64,'base64');if(!data.length||data.length>8_000_000)throw new Error('Archivo vacío o superior a 8 MB.');
  const dir=join(root,id);await mkdir(dir,{recursive:true});const path=join(dir,`${kind}.${ext}`);
  for(const old of [`music.mp3`,`music.wav`,`music.m4a`,`music.ogg`,`music.aac`,`effects.mp3`,`effects.wav`,`effects.m4a`,`effects.ogg`,`effects.aac`])if(old.startsWith(`${kind}.`))await unlink(join(dir,old)).catch(()=>{});
  await writeFile(path,data,{mode:0o600});p.audioTracks=p.audioTracks||{};p.audioTracks[kind]={url:`/media/${id}/${kind}.${ext}`,filename:String(filename).slice(0,120),status:'ready'};
  await persist();await logEvent('audio_uploaded',`${kind==='music'?'Música':'Efectos'} añadidos a la producción`,id);return p.audioTracks[kind];
}
