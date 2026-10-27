import { encodePontModelIdFromUpstream, upstreamFreeTierFlag } from './pont-model-id.js';
import type { ProviderId } from '../providers/provider-definitions.js';

export interface CatalogModelRow {
  id: string;
  providerId: ProviderId;
  owner: string;
  model: string;
  contextLength: number | null;
  free: boolean;
  inputToken: string | null;
  inputCacheToken: string | null;
  outputToken: string | null;
  outputCacheToken: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pricingString(pricing: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const raw = pricing[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return String(raw);
    }
  }
  return null;
}

function positiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function contextLengthFrom(item: Record<string, unknown>): number | null {
  const direct = positiveInt(item.context_length);
  if (direct) {
    return direct;
  }
  const top = item.top_provider;
  if (isRecord(top)) {
    return positiveInt(top.context_length);
  }
  return null;
}

function ownerFrom(upstreamId: string, item: Record<string, unknown>, providerId: ProviderId): string {
  if (typeof item.owned_by === 'string' && item.owned_by.trim()) {
    return item.owned_by.trim();
  }
  if (upstreamId.includes('/')) {
    return upstreamId.split('/')[0]!;
  }
  return providerId;
}

function pricingLooksFree(pricing: Record<string, unknown>): boolean {
  const keys = [
    'prompt',
    'completion',
    'request',
    'image',
    'input_cache_read',
    'input_cache_write',
    'cache_read',
    'cache_write',
    'output_cache_read',
  ];
  for (const key of keys) {
    const raw = pricing[key];
    if (raw === undefined) {
      continue;
    }
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (Number.isFinite(n) && n > 0) {
      return false;
    }
  }
  return true;
}

export function catalogRowsFromModelsJson(
  bodyText: string,
  providerId: ProviderId,
  freeSlugs: ReadonlySet<string>,
): CatalogModelRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
    return [];
  }
  const rows: CatalogModelRow[] = [];
  for (const entry of parsed.data) {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      continue;
    }
    const upstreamId = entry.id;
    const pontId = encodePontModelIdFromUpstream(providerId, upstreamId, freeSlugs);
    const { freeTier } = upstreamFreeTierFlag(providerId, upstreamId, freeSlugs);
    const pricing = isRecord(entry.pricing) ? entry.pricing : {};
    const free = freeTier || pricingLooksFree(pricing);
    const displayName =
      typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : upstreamId;
    rows.push({
      id: pontId,
      providerId,
      owner: ownerFrom(upstreamId, entry, providerId),
      model: displayName,
      contextLength: contextLengthFrom(entry),
      free,
      inputToken: pricingString(pricing, ['prompt', 'input']),
      inputCacheToken: pricingString(pricing, [
        'input_cache_read',
        'cache_read',
        'input_cache',
        'prompt_cache',
      ]),
      outputToken: pricingString(pricing, ['completion', 'output']),
      outputCacheToken: pricingString(pricing, ['output_cache_read', 'cache_write', 'output_cache']),
    });
  }
  return rows;
}
