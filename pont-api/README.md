# Pont API

NestJS gateway. Clients call one base path. The model id prefix picks OpenRouter (`openrouter-…`) or OpenCode Go (`opencode-…`).

## Routes

| Method | Path |
| --- | --- |
| GET | `/health` |
| GET | `/api/v1/models` |
| POST | `/api/v1/chat/completions` |
| POST | `/api/v1/responses` |
| POST | `/api/v1/messages` |

```text
http://localhost:9880/api/v1
```

Send `Authorization: Bearer pont_sk_…`. Upstream keys stay on the server (`OPENROUTER_API_KEY`, `OPENCODE_GO_API_KEY`).

## Environment

| Variable | Description |
| --- | --- |
| `PONT_PORT` | Listen port (default `9880`) |
| `OPENCODE_GO_BASE_URL` | Upstream inference root |
| `OPENCODE_GO_API_KEY` | OpenCode Go platform key |
| `OPENROUTER_API_KEY` | OpenRouter key |
| `PONT_USER_AGENT` | Upstream User-Agent (default `pont/0.1.0`) |

## Sessions

```http
x-opencode-session: <uuid-or-task-id>
```

If omitted, the gateway generates a UUID, forwards it to OpenCode Go, and returns it as `x-opencode-session`.

## Scripts

```bash
pnpm --filter @pont/api dev
pnpm --filter @pont/api test
pnpm --filter @pont/api build
```
