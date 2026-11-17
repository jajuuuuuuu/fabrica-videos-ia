import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const API='https://api.dev.runwayml.com/v1';
const headers=()=>({Authorization:`Bearer ${process.env.RUNWAYML_API_SECRET}`,'Content-Type':'application/json','X-Runway-Version':'2024-11-06'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,options={}){
  const response=await fetch(`${API}${path}`,{...options,headers:{...headers(),...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={error:raw.slice(0,1000)}}
  if(!response.ok)throw new Error(`Runway API (${response.status}): ${data.error||data.message||raw.slice(0,500)||'Error desconocido'}`);
  return data;
}
export async function createRunwayClip({imagePath,prompt,destination,ratio='720:1280',duration=5}){
  if(!process.env.RUNWAYML_API_SECRET)throw new Error('Falta RUNWAYML_API_SECRET para generar clips con Runway.');
  const image=await readFile(imagePath);
  if(image.length>3_800_000)throw new Error('La imagen de referencia supera el límite seguro de 3,8 MB para Runway.');
  const dataUri=`data:image/png;base64,${image.toString('base64')}`;
  const task=await request('/image_to_video',{method:'POST',body:JSON.stringify({model:process.env.RUNWAY_MODEL||'gen4_turbo',promptImage:dataUri,promptText:String(prompt).slice(0,950),ratio,duration,outputFormat:'mp4'})});
  if(!task.id)throw new Error('Runway no devolvió un ID de tarea.');
  for(let attempt=0;attempt<120;attempt++){
    await sleep(5000);
    const status=await request(`/tasks/${encodeURIComponent(task.id)}`,{method:'GET',headers:{'Content-Type':'application/json'}});
    if(status.status==='SUCCEEDED'){
      const url=Array.isArray(status.output)?status.output[0]:status.output?.url;
      if(!url)throw new Error('Runway terminó sin devolver un vídeo.');
      const video=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!video.ok)throw new Error(`No se pudo descargar el clip de Runway (${video.status}).`);
      await writeFile(destination,Buffer.from(await video.arrayBuffer()));
      return {taskId:task.id,model:process.env.RUNWAY_MODEL||'gen4_turbo'};
    }
    if(status.status==='FAILED' || status.status==='CANCELED')throw new Error(`Runway no pudo generar el clip: ${status.failure||status.error||status.status}`);
  }
  throw new Error(`Runway sigue procesando la tarea ${task.id}. Revisa el panel de producción más tarde.`);
}
