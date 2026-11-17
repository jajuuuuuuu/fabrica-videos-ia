import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { generateScript } from '../src/providers/openai.js';

test('el generador local produce escenas y no requiere API key', async () => {
  const old = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  const result = await generateScript('un robot aprende a cuidar un jardín', 'short');
  assert.equal(result.source, 'plantilla_local');
  assert.ok(result.script.scenes.length >= 3);
  assert.ok(result.script.scenes.every(s => s.seconds > 0));
  if (old) process.env.OPENAI_API_KEY = old;
});

test('API crea una producción y expone estado real', async (t) => {
  const port = 34000 + Math.floor(Math.random()*1000);
  const child = spawn(process.execPath, ['src/server/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '' }, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM'));
  let ready = false;
  for (let i=0;i<40;i++) { try { const r=await fetch(`http://127.0.0.1:${port}/api/health`); if(r.ok){ready=true;break;} } catch {} await delay(150); }
  assert.equal(ready,true,'server should start');const health=await fetch(`http://127.0.0.1:${port}/api/health`);assert.equal((await health.json()).version,'1.0.0');assert.equal(health.headers.get('x-frame-options'),'DENY');assert.ok(health.headers.get('content-security-policy'));
  const response = await fetch(`http://127.0.0.1:${port}/api/productions`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({idea:'Un pequeño dinosaurio busca a su mamá',format:'short'}) });
  assert.equal(response.status,201);
  const {item}=await response.json(); assert.ok(item.id); assert.equal(item.idea,'Un pequeño dinosaurio busca a su mamá');
  let finalItem=item; for(let i=0;i<50;i++){ await delay(100); const state=await fetch(`http://127.0.0.1:${port}/api/productions/${item.id}`); finalItem=(await state.json()).item; if(finalItem.status==='awaiting_assets'||finalItem.status==='failed') break; }
  assert.equal(finalItem.status,'awaiting_assets'); assert.ok(finalItem.script?.scenes?.length); assert.equal(finalItem.progress,100);
  const invalid=await fetch(`http://127.0.0.1:${port}/api/productions`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({idea:'hola'}) });
  assert.equal(invalid.status,400);
  const characterResponse=await fetch(`http://127.0.0.1:${port}/api/characters`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Lumo',appearance:'Zorro naranja pequeño con ojos verdes y pañuelo azul'})});
  assert.equal(characterResponse.status,201); const {item:character}=await characterResponse.json(); assert.ok(character.id);
  const withCharacter=await fetch(`http://127.0.0.1:${port}/api/productions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idea:'Lumo encuentra un bosque mágico y ayuda a sus amigos',characterId:character.id})});
  assert.equal(withCharacter.status,201); const production=(await withCharacter.json()).item; assert.equal(production.character.name,'Lumo'); assert.match(production.character.appearance,/pañuelo azul/);
  const audioUpload=await fetch(`http://127.0.0.1:${port}/api/productions/${production.id}/audio`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'music',filename:'tema.mp3',dataBase64:Buffer.from('audio-test').toString('base64')})});assert.equal(audioUpload.status,200);assert.equal((await audioUpload.json()).item.filename,'tema.mp3');
});

test('FFmpeg monta un MP4 real a partir de imágenes y narración', async (t) => {
  const { mkdtemp, mkdir, writeFile, access, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { renderProduction } = await import('../src/media/render.js');
  const dir = await mkdtemp(join(tmpdir(), 'fabrica-render-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const media = join(dir,'media'); await mkdir(media);
  for (let i=1;i<=2;i++) {
    const result=spawnSync('ffmpeg',['-y','-f','lavfi','-i',`color=c=${i===1?'blue':'red'}:s=360x640`,'-frames:v','1',join(media,`scene-${i}.png`)],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
  const audio=spawnSync('ffmpeg',['-y','-f','lavfi','-i','sine=frequency=440:duration=2','-q:a','5',join(media,'narration.mp3')],{encoding:'utf8'});
  assert.equal(audio.status,0,audio.stderr);
  const music=spawnSync('ffmpeg',['-y','-f','lavfi','-i','sine=frequency=220:duration=1','-q:a','5',join(media,'music.mp3')],{encoding:'utf8'});assert.equal(music.status,0,music.stderr);
  const effects=spawnSync('ffmpeg',['-y','-f','lavfi','-i','sine=frequency=880:duration=1','-q:a','5',join(media,'effects.mp3')],{encoding:'utf8'});assert.equal(effects.status,0,effects.stderr);
  const p={id:'test-render',format:'short',script:{scenes:[{seconds:2,narration:'Primera escena'},{seconds:2,narration:'Segunda escena'}]}};
  const result=await renderProduction(p,media,join(dir,'out'));
  await access(result.file); assert.equal(result.resolution,'720x1280'); assert.ok(result.durationSeconds>=4); assert.equal(result.qualityCheck.video,true); assert.equal(result.qualityCheck.audio,true); assert.equal(result.qualityCheck.subtitlesBurned,true); assert.deepEqual(result.audioTracks,{music:true,effects:true});assert.equal(result.qualityCheck.generatedClips,false);
  for(let i=1;i<=2;i++){const clip=spawnSync('ffmpeg',['-y','-loop','1','-i',join(media,`scene-${i}.png`),'-t','2','-vf','fps=24','-an','-c:v','libx264','-pix_fmt','yuv420p',join(media,`clip-${i}.mp4`)],{encoding:'utf8'});assert.equal(clip.status,0,clip.stderr)}
  const clipResult=await renderProduction(p,media,join(dir,'out'));assert.equal(clipResult.qualityCheck.generatedClips,true);assert.equal(clipResult.qualityCheck.generatedClipCount,2);
});

test('Runway no intenta generar clips sin una API key', async () => { const old=process.env.RUNWAYML_API_SECRET;delete process.env.RUNWAYML_API_SECRET;const {createRunwayClip}=await import('../src/providers/runway.js');await assert.rejects(()=>createRunwayClip({imagePath:'missing.png',prompt:'test',destination:'out.mp4'}),/RUNWAYML_API_SECRET/);if(old)process.env.RUNWAYML_API_SECRET=old; });

test('YouTube OAuth exige credenciales y no finge una conexión', async () => { const oldId=process.env.YOUTUBE_CLIENT_ID,oldSecret=process.env.YOUTUBE_CLIENT_SECRET;delete process.env.YOUTUBE_CLIENT_ID;delete process.env.YOUTUBE_CLIENT_SECRET;const {youtubeAuthUrl,youtubeStatus}=await import('../src/providers/youtube.js');await assert.rejects(()=>youtubeAuthUrl(),/YOUTUBE_CLIENT_ID/);assert.equal(youtubeStatus().connected,false);if(oldId)process.env.YOUTUBE_CLIENT_ID=oldId;if(oldSecret)process.env.YOUTUBE_CLIENT_SECRET=oldSecret; });

test('YouTube auth URL usa state y scopes OAuth esperados', async () => { const oldId=process.env.YOUTUBE_CLIENT_ID,oldSecret=process.env.YOUTUBE_CLIENT_SECRET,oldRedirect=process.env.YOUTUBE_REDIRECT_URI;process.env.YOUTUBE_CLIENT_ID='test-client.apps.googleusercontent.com';process.env.YOUTUBE_CLIENT_SECRET='test-secret';process.env.YOUTUBE_REDIRECT_URI='http://localhost:3030/api/oauth/youtube/callback';const {youtubeAuthUrl}=await import('../src/providers/youtube.js');const url=new URL(await youtubeAuthUrl());assert.equal(url.hostname,'accounts.google.com');assert.ok(url.searchParams.get('state'));assert.match(url.searchParams.get('scope'),/youtube.upload/);assert.match(url.searchParams.get('scope'),/yt-analytics.readonly/);if(oldId===undefined)delete process.env.YOUTUBE_CLIENT_ID;else process.env.YOUTUBE_CLIENT_ID=oldId;if(oldSecret===undefined)delete process.env.YOUTUBE_CLIENT_SECRET;else process.env.YOUTUBE_CLIENT_SECRET=oldSecret;if(oldRedirect===undefined)delete process.env.YOUTUBE_REDIRECT_URI;else process.env.YOUTUBE_REDIRECT_URI=oldRedirect; });
