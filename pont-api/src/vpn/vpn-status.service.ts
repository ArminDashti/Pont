import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { networkInterfaces } from 'node:os';

import { type PontConfig, pontConfigKey } from '../config/pont.config.js';

/** OpenVPN device name the entrypoint waits for. */
export const VPN_INTERFACE = 'tun0';
export const PUBLIC_IP_URL = 'https://api.ipify.org?format=json';
const PUBLIC_IP_TTL_MS = 30_000;
const PUBLIC_IP_TIMEOUT_MS = 5_000;

export interface VpnStatus {
  skipped: boolean;
  up: boolean;
  interface: string;
  assignedIp: string | null;
  publicIp: string | null;
  publicIpError: string | null;
  checkedAt: string;
}

/** Tunnel state from the local interface list; public IP is whatever route the process egresses on. */
@Injectable()
export class VpnStatusService {
  private cached: { at: number; publicIp: string | null; error: string | null } | undefined;

  constructor(private readonly configService: ConfigService) {}

  async status(refresh = false): Promise<VpnStatus> {
    const config = this.configService.getOrThrow<PontConfig>(pontConfigKey);
    const assignedIp =
      networkInterfaces()[VPN_INTERFACE]?.find((entry) => entry.family === 'IPv4')?.address ?? null;
    const publicIp = await this.lookupPublicIp(refresh);
    return {
      skipped: config.openvpnSkip,
      up: assignedIp !== null,
      interface: VPN_INTERFACE,
      assignedIp,
      publicIp: publicIp.value,
      publicIpError: publicIp.error,
      checkedAt: new Date().toISOString(),
    };
  }

  private async lookupPublicIp(refresh: boolean): Promise<{ value: string | null; error: string | null }> {
    const hit = this.cached;
    if (!refresh && hit && Date.now() - hit.at < PUBLIC_IP_TTL_MS) {
      return { value: hit.publicIp, error: hit.error };
    }
    let value: string | null = null;
    let error: string | null = null;
    try {
      const response = await fetch(PUBLIC_IP_URL, { signal: AbortSignal.timeout(PUBLIC_IP_TIMEOUT_MS) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as { ip?: unknown };
      if (typeof body.ip !== 'string' || !body.ip) {
        throw new Error('Unexpected public IP response');
      }
      value = body.ip;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Public IP lookup failed';
    }
    this.cached = { at: Date.now(), publicIp: value, error };
    return { value, error };
  }
}
