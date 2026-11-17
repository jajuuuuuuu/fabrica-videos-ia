# Despliegue y operación — v1.0

## Recomendado
- Desarrollo/uso personal: ejecutar en `127.0.0.1:3030`.
- Servidor privado: Docker con volumen persistente para `/app/data`, detrás de VPN o proxy con autenticación.
- No exponer el panel directamente a Internet: esta versión todavía no tiene login multiusuario.

## Docker
```bash
docker build -t fabrica-videos-ia:1.0 .
docker run -d --name fabrica-videos-ia --restart unless-stopped \
  -p 127.0.0.1:3030:3030 --env-file .env -e HOST=0.0.0.0 \
  -v fabrica-data:/app/data fabrica-videos-ia:1.0
```

Para usar un reverse proxy, expón el proxy por HTTPS y añade una capa de autenticación (Cloudflare Access, Authelia, VPN u otra equivalente). El contenedor escucha en `0.0.0.0` internamente, pero el ejemplo publica el puerto solo en loopback del host.

## Datos y secretos
- `.env` contiene claves de proveedores: no subirlo a Git ni incluirlo en copias públicas.
- `data/store.json` contiene producciones, configuración y tokens OAuth: proteger y respaldar con acceso restringido.
- `data/media/` contiene imágenes, audio y vídeos generados; necesita almacenamiento persistente y espacio suficiente.
- Los secretos deben inyectarse desde el gestor de secretos de la plataforma, no hornearse en la imagen.
- Usa un dominio HTTPS estable y registra el callback OAuth exacto en Google Cloud.

## Límites conocidos
- El sistema de trabajos y la cola siguen siendo locales al proceso; no es todavía una arquitectura multi-worker distribuida.
- El montaje y la generación multimedia consumen CPU, memoria, espacio y créditos de proveedores.
- La carga a YouTube usa una carga resumible de una sola petición de datos y limita este conector a 256 MB por vídeo.
- Tendencias dependen del RSS público de Google Trends, que puede cambiar o dejar de responder.
- Antes de ofrecerlo a otros usuarios, añade autenticación propia, autorización por usuario, protección CSRF de sesión, cuotas, auditoría y almacenamiento de objetos.
