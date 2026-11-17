import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://api.openai.com/v1';
function requireKey() {
  if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY. Conecta OpenAI en Integraciones para generar imágenes y voces.');
  return process.env.OPENAI_API_KEY;
}
async function request(path, payload, accept = 'application/json') {
  const response = await fetch(`${API}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${requireKey()}`, 'Content-Type': 'application/json', Accept: accept },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 700)}`);
  return response;
}
export async function generateSceneImage(prompt, destination) {
  const response = await request('/images/generations', {
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare',
    prompt: `${prompt}. Original cinematic frame for a family-friendly video. No lettering, no watermark.`,
    size: '1024x1536', quality: process.env.OPENAI_IMAGE_QUALITY || 'medium', output_format: 'png', n: 1
  });
  const data = await response.json();
  const encoded = data.data?.[0]?.b64_json;
  if (!encoded) throw new Error('La API de imágenes no devolvió una imagen en base64.');
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, Buffer.from(encoded, 'base64'));
  return { path: destination, model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare' };
}
export async function generateNarration(text, destination) {
  const response = await request('/audio/speech', {
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    voice: process.env.OPENAI_TTS_VOICE || 'alloy',
    input: text.slice(0, 4000),
    instructions: 'Habla en español latino neutro, con calidez, claridad y ritmo natural. Es una narración audiovisual.',
    response_format: 'mp3'
  }, 'audio/mpeg');
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return { path: destination, model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: process.env.OPENAI_TTS_VOICE || 'alloy' };
}

export async function generateThumbnail(prompt, destination) {
  const response = await request('/images/generations', {
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare',
    prompt: `YouTube thumbnail, 16:9 landscape composition. ${prompt}. One clear focal subject, expressive emotion, strong foreground/background separation, vivid cinematic lighting, polished professional children's animation look. Leave clean negative space for optional title overlay. No text, no logos, no watermark.`,
    size: '1536x1024', quality: process.env.OPENAI_IMAGE_QUALITY || 'medium', output_format: 'png', n: 1
  });
  const data = await response.json(); const encoded = data.data?.[0]?.b64_json;
  if (!encoded) throw new Error('La API de imágenes no devolvió una miniatura en base64.');
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, Buffer.from(encoded, 'base64'));
  return { path: destination, model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare' };
}
