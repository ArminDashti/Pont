# Pont

Unified LLM gateway and WebUI (fork of Yoda `providers`). Supports **OpenCode Go** and **OpenRouter** with per-user gateway API keys, optional `x-opencode-session`, and Pont model ids like `opencode-deepseek-4-1-free`.

## Local development

```powershell
cd C:\Users\armin\GitHub\UnifiedProviders
$env:PONT_OPENVPN_SKIP = "1"
pnpm install
pnpm --filter @pont/opencode-go run build
pnpm --filter @pont/api run dev
# separate terminal
pnpm --filter @pont/webui run dev
```

- API: http://127.0.0.1:9880
- WebUI: http://127.0.0.1:9881
- Default admin (empty DB): `admin` / `admin` — gateway key printed once in API logs on first boot

## Environment

| Variable | Description |
|----------|-------------|
| `PONT_PORT` | API port (default `9880`) |
| `PONT_DB_PATH` | SQLite path (default `data/pont.db`) |
| `PONT_USER_AGENT` | Upstream User-Agent (default `pont/0.1.0`) |
| `PONT_ADMIN_JWT_SECRET` | JWT secret for WebUI login |
| `PONT_WEBUI_ORIGIN` | CORS origin for WebUI (default `http://127.0.0.1:9881`) |
| `OPENROUTER_API_KEY` | Fallback OpenRouter key |
| `OPENCODE_GO_API_KEY` | Fallback OpenCode Go key |
| `OPENCODE_GO_BASE_URL` | OpenCode Go upstream root |
| `PONT_OPENVPN_SKIP` | `1` to skip VPN (dev) |
| `PONT_OPENVPN_CONFIG` | Filename under `openvpn/` (default `client.ovpn`) |

## Client usage

```http
Authorization: Bearer <your pont gateway key>
x-opencode-session: <optional-session-id>
```

Gateway paths:

- `http://localhost:9880/api/v1/...` — one endpoint for every provider; the model prefix picks it:
  `openrouter-…` → OpenRouter, `opencode-…` → OpenCode Go.
- `http://localhost:9880/openrouter/v1/...` — OpenRouter pinned (no prefix needed).
- `http://localhost:9880/zen/go/v1/...` — OpenCode Go pinned, old path kept for existing clients.

## Docker (local)

```powershell
docker compose up -d --build
```

- API: http://127.0.0.1:9880 (image `pont-api:local`, SQLite in volume `pont_pont-data`)
- WebUI: http://127.0.0.1:9881 (image `pont-webui:local`, static nginx build; `/api` is proxied to `pont-api`)

Pass provider keys through the environment (`OPENROUTER_API_KEY`, `OPENCODE_GO_API_KEY`) or set them in the
WebUI → Providers page (stored in the DB volume). `docker compose down` keeps the volume; never use `-v`.

VPN configs: see [openvpn/README.md](openvpn/README.md).
