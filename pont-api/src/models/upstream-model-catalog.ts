import { encodePontModelIdFromUpstream, parsePontModelId, upstreamFreeTierFlag } from './pont-model-id.js';
import type { ProviderId } from '../providers/provider-definitions.js';

export type CatalogPricingFields = Pick<
  CatalogModelRow,
  'inputToken' | 'inputCacheToken' | 'outputToken' | 'outputCacheToken'
>;

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

function pricingFieldsFromRecord(pricing: Record<string, unknown>): CatalogPricingFields {
  return {
    inputToken: pricingString(pricing, ['prompt', 'input']),
    inputCacheToken: pricingString(pricing, [
      'input_cache_read',
      'cache_read',
      'input_cache',
      'prompt_cache',
    ]),
    outputToken: pricingString(pricing, ['completion', 'output']),
    outputCacheToken: pricingString(pricing, ['output_cache_read', 'cache_write', 'output_cache']),
  };
}

/** Match OpenCode Go slugs to OpenRouter ids by normalized model tail (dots → hyphens). */
export function catalogPricingLookupKey(upstreamId: string): string {
  const base = upstreamId.replace(/^~+/, '').trim();
  const tail = base.includes('/') ? base.split('/').pop()! : base;
  return tail.replace(/\./g, '-').toLowerCase();
}

export function pricingLookupFromModelsJson(bodyText: string): Map<string, CatalogPricingFields> {
  const lookup = new Map<string, CatalogPricingFields>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    return lookup;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
    return lookup;
  }
  for (const entry of parsed.data) {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      continue;
    }
    const pricing = isRecord(entry.pricing) ? entry.pricing : {};
    const fields = pricingFieldsFromRecord(pricing);
    if (!fields.inputToken && !fields.outputToken) {
      continue;
    }
    lookup.set(catalogPricingLookupKey(entry.id), fields);
  }
  return lookup;
}

export function mergeMissingCatalogPricing(row: CatalogModelRow, lookup: Map<string, CatalogPricingFields>): void {
  if (row.providerId !== 'opencode-go') {
    return;
  }
  if (row.inputToken || row.outputToken) {
    return;
  }
  const parsed = parsePontModelId(row.id);
  if (!parsed) {
    return;
  }
  const source = lookup.get(catalogPricingLookupKey(parsed.upstreamSlug));
  if (!source) {
    return;
  }
  if (!row.inputToken && source.inputToken) {
    row.inputToken = source.inputToken;
  }
  if (!row.inputCacheToken && source.inputCacheToken) {
    row.inputCacheToken = source.inputCacheToken;
  }
  if (!row.outputToken && source.outputToken) {
    row.outputToken = source.outputToken;
  }
  if (!row.outputCacheToken && source.outputCacheToken) {
    row.outputCacheToken = source.outputCacheToken;
  }
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

const AGGREGATOR_OWNERS = new Set(['opencode', 'openrouter', 'system']);

const CREATOR_BY_SLUG_PREFIX: Record<string, string> = {
  claude: 'anthropic',
  gpt: 'openai',
  grok: 'xai',
  gemini: 'google',
  glm: 'zhipu',
  deepseek: 'deepseek',
  kimi: 'moonshot',
  minimax: 'minimax',
  hy: 'tencent',
  step: 'stepfun',
  longcat: 'meituan',
  mimo: 'xiaomi',
};

function slugPrefix(upstreamId: string): string {
  const base = upstreamId.replace(/^~+/, '').trim();
  const slash = base.lastIndexOf('/');
  const tail = slash >= 0 ? base.slice(slash + 1) : base;
  const hyphen = tail.indexOf('-');
  return (hyphen >= 0 ? tail.slice(0, hyphen) : tail).toLowerCase();
}

function creatorFromUpstreamSlug(upstreamId: string): string {
  const prefix = slugPrefix(upstreamId);
  const mapped = CREATOR_BY_SLUG_PREFIX[prefix];
  if (mapped) {
    return mapped;
  }
  if (prefix.startsWith('qwen')) {
    return 'qwen';
  }
  if (prefix.startsWith('hy')) {
    return 'tencent';
  }
  return prefix || upstreamId;
}

function ownerFrom(upstreamId: string, item: Record<string, unknown>, providerId: ProviderId): string {
  if (upstreamId.includes('/')) {
    return upstreamId.split('/')[0]!.replace(/^~+/, '').trim();
  }
  const ownedBy = typeof item.owned_by === 'string' ? item.owned_by.trim() : '';
  if (
    ownedBy &&
    !AGGREGATOR_OWNERS.has(ownedBy.toLowerCase()) &&
    ownedBy !== providerId
  ) {
    return ownedBy;
  }
  const fromName = creatorFromModelName(item.name);
  if (fromName) {
    return fromName;
  }
  return creatorFromUpstreamSlug(upstreamId);
}

function creatorFromModelName(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  const match = name.trim().match(/^([^:]+):/);
  if (!match) {
    return null;
  }
  const label = match[1]!.trim();
  if (!label) {
    return null;
  }
  return label.replace(/\s+/g, ' ').split(' ')[0]!.toLowerCase();
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
    const priceFields = pricingFieldsFromRecord(pricing);
    rows.push({
      id: pontId,
      providerId,
      owner: ownerFrom(upstreamId, entry, providerId),
      model: displayName,
      contextLength: contextLengthFrom(entry),
      free,
      ...priceFields,
    });
  }
  return rows;
}
