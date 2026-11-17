FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3030 HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p data && chown -R node:node /app && chmod 700 data
USER node
EXPOSE 3030
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3030/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server/index.js"]
