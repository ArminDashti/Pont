# @yoda/providers

NestJS gateway (`yoda-providers` container) that exposes a **drop-in OpenCode Go** base URL for the Yoda monorepo.

## Providers

The catalog in `src/providers/provider-definitions.ts` lists every provider and its endpoints: OpenRouter, OpenAI, Anthropic, OpenCode Go, and OpenCode Zen. Each provider is reachable through the gateway at `/<provider>/v1/...` (OpenCode Go also keeps `/zen/go/v1/...` for existing clients).

| Provider | Gateway prefix | Env var (fallback key) |
| --- | --- | --- |
| `openrouter` | `/openrouter/v1` | `OPENROUTER_API_KEY` |
| `openai` | `/openai/v1` | `OPENAI_API_KEY` |
| `anthropic` | `/anthropic/v1` | `ANTHROPIC_API_KEY` |
| `opencode-go` | `/zen/go/v1` | `OPENCODE_GO_API_KEY` |
| `opencode-zen` | `/opencode-zen/v1` | `OPENCODE_ZEN_API_KEY` |

Keys saved in the control panel take precedence over the environment variables.

Internal control-plane routes (api container only, guarded by `YODA_PROVIDERS_INTERNAL_KEY`):

- `GET /internal/providers/catalog`, `GET /internal/providers/:id/models`
- `POST /internal/providers/:id/test`, `POST /internal/providers/:id/endpoints/:endpointId/test`
- `GET|PUT /internal/app-models/:app` for `chat`, `agent`, and `extension`

## Base URL

```text
http://localhost:8790/zen/go/v1
```

Clients still call `/models`, `/chat/completions`, `/responses`, and `/messages` on the gateway. Upstream OpenCode Go uses the [inference/go endpoints](https://opencode.ai/v2/docs/console/go) (`/v1/models`, `/openai/v1/chat/completions`, and so on).

## Environment

| Variable | Description |
| --- | --- |
| `YODA_PROVIDERS_PORT` | Listen port (default `8790`) |
| `OPENCODE_GO_BASE_URL` | Upstream inference root (default `https://opencode.ai/inference/go`) |
| `OPENCODE_GO_API_KEY` | Platform OpenCode Go key (`oc_sk_…`) |
| `YODA_API_KEY` | Optional gateway key; when set, clients must send `Authorization: Bearer <YODA_API_KEY>` |
| `YODA_PROVIDERS_USER_AGENT` | Upstream User-Agent (default `yoda-providers/0.1.0`) |

### Auth modes

- **Platform key:** set `OPENCODE_GO_API_KEY`. Clients may omit OpenCode credentials when `YODA_API_KEY` protects the gateway.
- **BYOK (dev):** leave `YODA_API_KEY` unset and send `Authorization: Bearer <your OpenCode Go key>`.

## Sessions

Send a stable conversation id on every completion request:

```http
x-opencode-session: <uuid-or-task-id>
```

If omitted, the gateway generates a UUID, forwards it to OpenCode Go, and returns it on the response as `x-opencode-session`.

## Clients

| App | Setting |
| --- | --- |
| `nanobrowser` | Default OpenCode Go base URL is `http://localhost:8790/zen/go/v1` (override with `VITE_OPENCODE_GO_BASE_URL`) |
| `nanobot` | custom provider `apiBase: http://yoda-providers:8790/zen/go/v1` (see `api/config/nanobot/config.json`) |
| `open-webui` | `OPENAI_API_BASE_URL=http://yoda-providers:8790/zen/go/v1` (set in `docker-compose.yml`) |

## Scripts

```bash
pnpm --filter @yoda/providers dev
pnpm --filter @yoda/providers test
pnpm --filter @yoda/providers build
```
