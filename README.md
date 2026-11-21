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
- Default admin (empty DB): username/password `admin` / `admin`. The gateway key is printed once in API logs on first boot. There is no login API; paste that key into clients and the WebUI.

## Environment

| Variable | Description |
|----------|-------------|
| `PONT_PORT` | API port (default `9880`) |
| `PONT_DB_PATH` | SQLite path (default `data/pont.db`) |
| `PONT_USER_AGENT` | Upstream User-Agent (default `pont/0.1.0`) |
| `PONT_WEBUI_ORIGIN` | CORS origin for WebUI (default `http://127.0.0.1:9881`) |
| `OPENROUTER_API_KEY` | Fallback OpenRouter key |
| `OPENCODE_GO_API_KEY` | Fallback OpenCode Go key |
| `OPENCODE_GO_BASE_URL` | OpenCode Go upstream root |
| `PONT_OPENVPN_SKIP` | `1` to skip VPN (dev) |
| `PONT_OPENVPN_CONFIG` | Filename under `openvpn/` (default `client.ovpn`) |

## Client usage

LLM clients send the per-user gateway key (`pont_sk_…`) printed at first boot. Session login tokens are not accepted.

```http
Authorization: Bearer <your pont gateway key>
x-opencode-session: <optional-session-id>
```

Gateway paths:

- `http://localhost:9880/api/v1/models`
- `http://localhost:9880/api/v1/chat/completions`
- `http://localhost:9880/api/v1/responses`
- `http://localhost:9880/api/v1/messages`

The model id prefix picks the provider: `openrouter-…` → OpenRouter, `opencode-…` → OpenCode Go.

### Claude Code (Anthropic Messages API)

Point the Anthropic client at Pont’s Messages endpoint (nginx exposes it as `/v1/messages`; the API path is `/api/v1/messages`):

```bash
export ANTHROPIC_BASE_URL=https://pont.xaigrok.ir   # or http://127.0.0.1:9880 for local API (no /v1 prefix)
export ANTHROPIC_API_KEY=<your pont gateway key>      # same as Authorization Bearer pont_sk_…
```

Use prefixed Pont model ids, e.g. `opencodego-claude-haiku-5-5` or `openrouter-anthropic-claude-3.5-sonnet`. Non-Claude models are translated to OpenAI chat/completions upstream automatically.

- `GET http://localhost:9880/health` — liveness.

## Docker (local)

```powershell
docker compose up -d --build
```

- API: http://127.0.0.1:9880 (image `pont-api:local`, SQLite in volume `pont_pont-data`)
- WebUI: http://127.0.0.1:9881 (image `pont-webui:local`, static nginx build; `/api` is proxied to `api`)

Pass provider keys through the environment (`OPENROUTER_API_KEY`, `OPENCODE_GO_API_KEY`). `docker compose down` keeps the volume; never use `-v`.

VPN configs: see [openvpn/README.md](openvpn/README.md).
