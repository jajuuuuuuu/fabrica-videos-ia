# Publicar Fábrica de Vídeos IA v1.0 en la web

Este proyecto ya incluye frontend y servidor: no es una página HTML estática. Se publica como servicio Node.js para que funcionen la API, la cola, los archivos multimedia y las integraciones.

## Antes de publicarlo
**No expongas esta versión directamente a Internet.** El panel todavía no tiene inicio de sesión ni separación de datos por usuario. Úsalo solo detrás de una capa de acceso privado (por ejemplo, Cloudflare Access o una VPN) y con HTTPS. No compartas el enlace sin protegerlo.

## Despliegue
1. Sube el contenido de esta carpeta a un repositorio privado de GitHub.
2. En tu proveedor de hosting Node.js, crea un servicio desde ese repositorio.
3. Usa `npm install` como comando de construcción y `npm start` como comando de inicio.
4. Configura almacenamiento persistente montado en `/app/data`.
5. Configura las variables secretas desde el panel del proveedor. No subas `.env` ni claves a GitHub.
6. Añade protección de acceso (Cloudflare Access/VPN) antes de usarlo remotamente.
7. Si conectas YouTube, configura `YOUTUBE_REDIRECT_URI` con la URL HTTPS final y registra exactamente esa dirección de callback en Google Cloud: `/api/oauth/youtube/callback`.

## Variables
- `OPENAI_API_KEY`: clave de OpenAI (si usarás esas funciones).
- `RUNWAY_API_KEY`: clave de Runway (si usarás generación con Runway).
- `YOUTUBE_CLIENT_ID` y `YOUTUBE_CLIENT_SECRET`: OAuth de YouTube.
- `YOUTUBE_REDIRECT_URI`: callback OAuth con el dominio final.
- `HOST`: `0.0.0.0` en hosting.
- `PORT`: puerto entregado por el proveedor.

Las APIs de terceros pueden generar cobros. No se incluyen claves ni créditos.

## Prueba local
Requiere Node.js 20+ y FFmpeg:
```bash
npm install
npm run check
npm test
npm start
```
Abre `http://localhost:3030`.
