FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8686 \
    DATA_DIR=/data

LABEL org.opencontainers.image.title="FishTVBox" \
      org.opencontainers.image.description="IPTV, movies, Bilibili shorts and remote control in a single Docker container" \
      org.opencontainers.image.source="https://github.com/waterfish25/FishTVBox" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY package.json ./
COPY server ./server
COPY web ./web

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 8686
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8686/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
