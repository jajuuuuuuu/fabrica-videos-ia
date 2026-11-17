export async function generateScript(idea, format = 'short') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { source: 'plantilla_local', script: localScript(idea, format) };
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = `Eres guionista audiovisual. Crea una propuesta ORIGINAL en español para: ${idea}. Formato: ${format}. Devuelve JSON válido con title, logline, durationSeconds, audience, scenes (array con number, visual, narration, sound, seconds), thumbnailPrompt, description, tags. No copies obras o personajes protegidos. Asegura continuidad y que la suma de segundos sea coherente.`;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: prompt, text: { format: { type: 'json_schema', name: 'video_script', strict: true, schema: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, logline: { type: 'string' }, durationSeconds: { type: 'integer' }, audience: { type: 'string' }, scenes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { number: { type: 'integer' }, visual: { type: 'string' }, narration: { type: 'string' }, sound: { type: 'string' }, seconds: { type: 'integer' } }, required: ['number','visual','narration','sound','seconds'] } }, thumbnailPrompt: { type: 'string' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title','logline','durationSeconds','audience','scenes','thumbnailPrompt','description','tags'] } } } }), signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) throw new Error(`OpenAI respondió ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const data = await response.json();
  const text = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
  if (!text) throw new Error('OpenAI no devolvió texto estructurado');
  return { source: 'openai', script: JSON.parse(text) };
}
function localScript(idea, format) {
  const short = format === 'short';
  return {
    title: `Una historia sobre ${idea.slice(0, 48)}`,
    logline: `Una propuesta original basada en la idea: ${idea}`,
    durationSeconds: short ? 45 : 180,
    audience: 'Por definir',
    scenes: [
      { number: 1, visual: 'Plano de apertura que presenta el mundo y al protagonista.', narration: `Todo comienza con una idea: ${idea}.`, sound: 'Ambiente suave de introducción', seconds: short ? 8 : 25 },
      { number: 2, visual: 'El protagonista descubre un desafío y decide actuar.', narration: 'Algo inesperado cambia el rumbo de la historia.', sound: 'Efecto sutil de descubrimiento', seconds: short ? 12 : 50 },
      { number: 3, visual: 'Secuencia central con una decisión y un momento emotivo.', narration: 'Con valentía e imaginación, encuentra una nueva posibilidad.', sound: 'Música en crecimiento', seconds: short ? 15 : 65 },
      { number: 4, visual: 'Resolución visual y cierre memorable.', narration: 'Y así comienza una aventura que merece continuar.', sound: 'Cierre musical cálido', seconds: short ? 10 : 40 }
    ],
    thumbnailPrompt: `Ilustración original y llamativa que represente: ${idea}. Composición clara, alto contraste, sin texto pequeño.`,
    description: 'Borrador local: completa y revisa esta descripción antes de publicar.',
    tags: ['historia original', 'animación', 'creatividad']
  };
}
