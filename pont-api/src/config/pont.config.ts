import { DEFAULT_OPENCODE_GO_INFERENCE_BASE, normalizeOpenCodeGoBase } from '@pont/opencode-go';
import { registerAs } from '@nestjs/config';

export const pontConfigKey = 'pont';

export interface PontConfig {
  upstreamBaseUrl: string;
  platformApiKey: string | undefined;
  dbPath: string;
  userAgent: string;
  port: number;
  jwtSecret: string;
  webuiOrigin: string;
  openvpnSkip: boolean;
}

export default registerAs(
  pontConfigKey,
  (): PontConfig => ({
    upstreamBaseUrl: normalizeOpenCodeGoBase(
      process.env.OPENCODE_GO_BASE_URL ?? DEFAULT_OPENCODE_GO_INFERENCE_BASE,
    ),
    platformApiKey: process.env.OPENCODE_GO_API_KEY?.trim() || undefined,
    dbPath: process.env.PONT_DB_PATH?.trim() || 'data/pont.db',
    userAgent: process.env.PONT_USER_AGENT?.trim() || 'pont/0.1.0',
    port: Number(process.env.PONT_PORT ?? 9880),
    jwtSecret: process.env.PONT_ADMIN_JWT_SECRET?.trim() || 'dev-change-me-pont-jwt-secret',
    webuiOrigin: process.env.PONT_WEBUI_ORIGIN?.trim() || 'http://127.0.0.1:9881',
    openvpnSkip: process.env.PONT_OPENVPN_SKIP === '1',
  }),
);
