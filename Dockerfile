FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache su-exec
ENV NODE_ENV=production \
    PORT=7889 \
    CONFIG_DIR=/config \
    PUID=1000 \
    PGID=1000
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh
VOLUME ["/config"]
EXPOSE 7889
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
