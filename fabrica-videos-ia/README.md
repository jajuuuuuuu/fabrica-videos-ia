# Fábrica de Vídeos IA — v1.0.0

Plataforma local para preparar guiones, generar recursos audiovisuales con proveedores configurados, montar MP4 con FFmpeg, mantener personajes, consultar tendencias, conectar YouTube y revisar analítica autorizada.

## Requisitos
- Node.js 20 o superior (probado con Node 22).
- FFmpeg y FFprobe instalados y disponibles en PATH.
- Conexiones/API keys de OpenAI y Runway para generación multimedia real; sus servicios pueden tener costes.
- Proyecto de Google Cloud con YouTube Data API v3 y YouTube Analytics API habilitadas para publicar/consultar un canal.

## Ejecutar localmente
1. Descomprime el proyecto.
2. Ejecuta `npm run check` y `npm test`.
3. Copia `.env.example` a `.env` y configura las claves que usarás.
4. Ejecuta `npm start`.
5. Abre `http://localhost:3030`.

La aplicación escucha en `127.0.0.1` por defecto para no exponerse accidentalmente a la red.

## YouTube OAuth
1. En Google Cloud crea un proyecto y habilita **YouTube Data API v3** y **YouTube Analytics API**.
2. Configura la pantalla de consentimiento OAuth y añade tu cuenta como usuario de prueba si la aplicación sigue en modo de prueba.
3. Crea credenciales OAuth de tipo **Aplicación web**.
4. Añade como URI de redirección autorizado exactamente `http://localhost:3030/api/oauth/youtube/callback`.
5. Copia `YOUTUBE_CLIENT_ID` y `YOUTUBE_CLIENT_SECRET` a `.env`.
6. Reinicia la aplicación, entra en Integraciones y pulsa **Vincular canal YouTube**.
7. La carga se inicia como **privada** por defecto. La opción pública requiere confirmación en la aplicación.

Los tokens OAuth se guardan en `data/store.json`, que tiene permisos restrictivos al crearse. No compartas esa carpeta ni el archivo `.env`. Revoca el acceso desde la configuración de seguridad de tu cuenta Google si pierdes control del equipo.

## v0.8 — publicación
- OAuth de Google con estado anti-CSRF, acceso offline y renovación del token.
- Carga MP4 a YouTube Data API con título, descripción, etiquetas y privacidad elegida.
- El estado de publicación solo cambia cuando Google confirma la carga.

## v0.9 — tendencias y analítica
- Tendencias de Google Trends para Chile mediante RSS público (sujeto a disponibilidad de Google).
- Métricas del canal mediante YouTube Analytics API con autorización explícita.
- No se inventan métricas ni se presentan datos de demostración como reales.

## v1.0 — base de despliegue y seguridad
- Dockerfile reproducible con FFmpeg, usuario no-root, volumen persistente y healthcheck.
- Cabeceras de seguridad, CSP básica, límites de solicitudes y archivos de configuración fuera de la carpeta pública.
- Almacenamiento JSON atómico y directorio de datos persistente.

**Aviso importante de despliegue:** v1.0 es una base desplegable, no un servicio multiusuario listo para exponerse directamente a Internet. No incluye cuentas de usuario ni autenticación de sesión para el panel. Para un servidor remoto, mantenlo privado o colócalo detrás de una capa de acceso autenticado (por ejemplo, VPN/Tailscale o Cloudflare Access) y HTTPS. No abras el puerto 3030 directamente al público.

## Docker
```bash
docker build -t fabrica-videos-ia .
docker run --rm -p 127.0.0.1:3030:3030 --env-file .env -e HOST=0.0.0.0 -v fabrica-data:/app/data fabrica-videos-ia
```

En nube, cambia `YOUTUBE_REDIRECT_URI` al dominio HTTPS real y registra exactamente el mismo URI en Google Cloud. Configura secretos desde el gestor de secretos de tu proveedor cuando sea posible, no dentro de la imagen Docker.

## Pruebas
```bash
npm run check
npm test
```

Las pruebas locales no consumen créditos de OpenAI ni Runway, no autorizan YouTube y no publican vídeos. Para comprobar las operaciones externas necesitas tus propias credenciales y consentimiento de Google.

## Publicar en la web
Consulta [PUBLICAR-EN-WEB.md](PUBLICAR-EN-WEB.md). Se incluye `render.yaml` como plantilla de despliegue. **No publiques el panel sin una capa de acceso autenticado**: esta versión no incluye login.
