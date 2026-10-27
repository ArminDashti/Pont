FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/opencode-go packages/opencode-go
COPY pont-api pont-api
# hoisted: workspace deps land in the root node_modules as real directories, not symlinks to /repo
RUN pnpm install --filter @pont/api... --node-linker=hoisted \
 && pnpm --filter @pont/api run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openvpn iproute2 \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PONT_PORT=9880 PONT_DB_PATH=/data/pont.db
COPY --from=build /repo/pont-api/dist ./dist
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/opencode-go ./node_modules/@pont/opencode-go
COPY --from=build /repo/pont-api/package.json ./package.json
COPY scripts/entrypoint.sh /app/scripts/entrypoint.sh
RUN chmod +x /app/scripts/entrypoint.sh && mkdir -p /data /etc/openvpn/pont && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 9880
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
