FROM node:24-bookworm-slim AS build
ARG VITE_BASE=/
ARG VITE_PONT_API_BASE_URL=/api
ARG VITE_PONT_API_HOST=
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY pont-webui pont-webui
RUN pnpm install --filter @pont/webui... \
 && if [ -z "$VITE_PONT_API_HOST" ]; then unset VITE_PONT_API_HOST; fi \
 && VITE_BASE=$VITE_BASE VITE_PONT_API_BASE_URL=$VITE_PONT_API_BASE_URL pnpm --filter @pont/webui run build

FROM nginx:alpine
COPY pont-webui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/pont-webui/dist /usr/share/nginx/html
EXPOSE 80
