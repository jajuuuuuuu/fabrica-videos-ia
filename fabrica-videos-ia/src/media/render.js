import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
const run = (args) => new Promise((resolve, reject) => {
  const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore','ignore','pipe'] }); let err='';
  p.stderr.on('data', d => { err += d.toString(); if (err.length > 16000) err = err.slice(-16000); });
  p.on('error', reject); p.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg terminó con código ${code}: ${err.slice(-2200)}`)));
});
const probe = args => new Promise((resolve, reject) => { const p=spawn(process.env.FFPROBE_PATH || 'ffprobe',args,{stdio:['ignore','pipe','pipe']}); let out='',err=''; p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d); p.on('error',reject); p.on('close',c=>c===0?resolve(out):reject(new Error(`FFprobe falló: ${err.slice(-1000)}`))); });
const stamp = s => { const ms=Math.max(0,Math.round(s*1000)); const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),sec=Math.floor(ms%60000/1000),milli=ms%1000; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(milli).padStart(3,'0')}`; };
async function findTrack(dir,kind){ for(const ext of ['mp3','wav','m4a','ogg','aac']){const p=join(dir,`${kind}.${ext}`);try{await access(p);return p}catch{}}return null; }
const escFilterPath = p => p.replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'", "\\'");
export async function renderProduction(production, mediaDir, outputDir) {
  const scenes=production.script?.scenes||[];
  if(!scenes.length) throw new Error('La producción no tiene escenas en su guion.');
  const images=scenes.map((_,i)=>join(mediaDir,`scene-${i+1}.png`));
  for(const image of images) await access(image);
  const narration=join(mediaDir,'narration.mp3'); await access(narration);
  await mkdir(outputDir,{recursive:true});
  const output=join(outputDir,`${production.id}.mp4`);
  const width=production.format==='long'?1280:720,height=production.format==='long'?720:1280,fps=24;
  const durations=scenes.map(s=>Math.max(2,Number(s.seconds)||5));
  const fade=Math.min(0.35,Math.min(...durations)/5);
  const segmentFiles=[];let generatedClipCount=0;
  for(let i=0;i<images.length;i++){
    const segment=join(mediaDir,`segment-${i+1}.mp4`),duration=durations[i],frames=Math.max(48,Math.round(duration*fps));
    const clip=join(mediaDir,`clip-${i+1}.mp4`);
    let hasClip=true;try{await access(clip)}catch{hasClip=false;}
    if(hasClip){
      generatedClipCount++;
      const vf=`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},trim=duration=${duration},setpts=PTS-STARTPTS,fade=t=in:st=0:d=${fade},fade=t=out:st=${Math.max(0,duration-fade)}:d=${fade},format=yuv420p,setsar=1`;
      await run(['-y','-i',clip,'-t',String(duration),'-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p',segment]);
    } else {
      const vf=`scale=${width*2}:${height*2}:force_original_aspect_ratio=increase,crop=${width*2}:${height*2},zoompan=z='min(zoom+0.0009,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps},trim=duration=${duration},fps=${fps},fade=t=in:st=0:d=${fade},fade=t=out:st=${Math.max(0,duration-fade)}:d=${fade},format=yuv420p,setsar=1`;
      await run(['-y','-loop','1','-i',images[i],'-t',String(duration),'-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p',segment]);
    }
    segmentFiles.push(segment);
  }
  const concat=join(mediaDir,'segments.txt');
  await writeFile(concat,segmentFiles.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n')+'\n');
  const joined=join(mediaDir,'joined.mp4');
  await run(['-y','-f','concat','-safe','0','-i',concat,'-c','copy',joined]);
  const srt=join(mediaDir,'subtitles.srt');let timeline=0;const captions=[];
  scenes.forEach((scene,i)=>{const end=timeline+durations[i];captions.push(`${i+1}\n${stamp(timeline)} --> ${stamp(end)}\n${String(scene.narration||'').replaceAll('-->','→')}\n`);timeline=end;});
  await writeFile(srt,captions.join('\n'));
  const subtitleFilter=`subtitles=${escFilterPath(srt)}:force_style='FontName=Arial,FontSize=18,Outline=2,Shadow=1,Alignment=2,MarginV=70'`;
  const totalDuration=String(durations.reduce((a,b)=>a+b,0));
  const audioInputs=['-i',joined,'-i',narration];
  const music=await findTrack(mediaDir,'music'),effects=await findTrack(mediaDir,'effects');
  if(music)audioInputs.push('-stream_loop','-1','-i',music);
  if(effects)audioInputs.push('-i',effects);
  let audioFilter='[1:a]apad[narr]';let audioMap='[narr]';const mix=['[narr]'];
  if(music){const index=2;audioFilter+=`;[${index}:a]volume=0.14[music]`;mix.push('[music]');}
  if(effects){const index=music?3:2;audioFilter+=`;[${index}:a]volume=0.24[effects]`;mix.push('[effects]');}
  if(mix.length>1){audioFilter+=`;${mix.join('')}amix=inputs=${mix.length}:duration=first:dropout_transition=2:normalize=0[mixed]`;audioMap='[mixed]';}
  await run(['-y',...audioInputs,'-filter_complex',audioFilter,'-map','0:v:0','-map',audioMap,'-vf',`${subtitleFilter},format=yuv420p`,'-r',String(fps),'-c:v','libx264','-preset','veryfast','-crf','24','-t',totalDuration,'-c:a','aac','-b:a','160k','-movflags','+faststart',output]);
  const info=JSON.parse(await probe(['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',output]));
  const video=info.streams?.find(x=>x.codec_type==='video'),audio=info.streams?.find(x=>x.codec_type==='audio');
  if(!video||!audio||Number(info.format?.duration)<=0)throw new Error('Control de calidad fallido: falta vídeo/audio o la duración no es válida.');
  return {file:output,durationSeconds:Number(info.format.duration),resolution:`${video.width}x${video.height}`,subtitles:srt,transitionSeconds:fade,audioTracks:{music:Boolean(music),effects:Boolean(effects)},qualityCheck:{video:true,audio:true,duration:true,subtitlesBurned:true,motion:true,transitions:scenes.length>1,generatedClips:generatedClipCount===images.length,generatedClipCount}};
}
