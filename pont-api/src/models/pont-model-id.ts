import type { ProviderId } from '../providers/provider-definitions.js';

const PONT_PROVIDER_PREFIX = /^(opencode|openrouter)-(.+)$/i;

export type PontProviderPrefix = 'opencode' | 'openrouter';

export interface ParsedPontModelId {
  pontPrefix: PontProviderPrefix;
  providerId: ProviderId;
  upstreamSlug: string;
  freeTier: boolean;
}

export function pontPrefixForProvider(providerId: ProviderId): PontProviderPrefix {
  return providerId === 'opencode-go' ? 'opencode' : 'openrouter';
}

export function providerIdFromPontPrefix(prefix: string): ProviderId | undefined {
  const lower = prefix.toLowerCase();
  if (lower === 'opencode') {
    return 'opencode-go';
  }
  if (lower === 'openrouter') {
    return 'openrouter';
  }
  return undefined;
}

export function parsePontModelId(modelId: string): ParsedPontModelId | undefined {
  const trimmed = modelId.trim();
  const match = trimmed.match(PONT_PROVIDER_PREFIX);
  if (!match) {
    return undefined;
  }
  const pontPrefix = match[1].toLowerCase() as PontProviderPrefix;
  const providerId = providerIdFromPontPrefix(pontPrefix);
  if (!providerId) {
    return undefined;
  }
  let remainder = match[2];
  let freeTier = false;
  if (remainder.toLowerCase().endsWith('-free')) {
    freeTier = true;
    remainder = remainder.slice(0, -5);
  }
  if (!remainder) {
    return undefined;
  }
  return { pontPrefix, providerId, upstreamSlug: remainder, freeTier };
}

/** Returns upstream model slug when input is a Pont id; otherwise returns input unchanged. */
/** OpenRouter free variants use a `:free` suffix instead of `-free`. */
export function stripOpenRouterFreeVariant(upstreamId: string): { core: string; freeTier: boolean } {
  const trimmed = upstreamId.trim().replace(/^~+/, '');
  if (/:free$/i.test(trimmed)) {
    return { core: trimmed.replace(/:free$/i, ''), freeTier: true };
  }
  return { core: trimmed, freeTier: false };
}

/** Flatten OpenRouter-style vendor/model ids for Pont (no ~, slashes → hyphens). */
export function normalizeUpstreamSlugForPont(upstreamId: string): string {
  const { core } = stripOpenRouterFreeVariant(upstreamId);
  const slash = core.indexOf('/');
  if (slash < 0) {
    return core;
  }
  return `${core.slice(0, slash)}-${core.slice(slash + 1)}`;
}

const OPENROUTER_HYPHENATED_VENDORS = ['meta-llama', 'x-ai'] as const;

/** Reverse {@link normalizeUpstreamSlugForPont} for OpenRouter upstream calls. */
export function pontSlugToOpenRouterUpstream(slug: string): string {
  const trimmed = slug.trim().replace(/^~+/, '');
  if (trimmed.includes('/')) {
    return trimmed;
  }
  for (const vendor of OPENROUTER_HYPHENATED_VENDORS) {
    const prefix = `${vendor}-`;
    if (trimmed.startsWith(prefix)) {
      return `${vendor}/${trimmed.slice(prefix.length)}`;
    }
  }
  const hyphen = trimmed.indexOf('-');
  if (hyphen < 0) {
    return trimmed;
  }
  const vendor = trimmed.slice(0, hyphen);
  const rest = trimmed.slice(hyphen + 1);
  if (!rest) {
    return trimmed;
  }
  // shortcut: hyphenated model ids without a vendor prefix (e.g. gpt-4o), upgrade when OR adds more
  if (vendor === 'gpt' || vendor === 'o1' || vendor === 'o3' || vendor === 'o4') {
    return trimmed;
  }
  return `${vendor}/${rest}`;
}

export function resolveUpstreamModelId(modelId: string): string {
  const parsed = parsePontModelId(modelId);
  if (!parsed) {
    return modelId;
  }
  if (parsed.providerId === 'openrouter') {
    let upstream = pontSlugToOpenRouterUpstream(parsed.upstreamSlug);
    if (parsed.freeTier && !/:free$/i.test(upstream)) {
      upstream = `${upstream}:free`;
    }
    return upstream;
  }
  return parsed.upstreamSlug;
}

export function upstreamFreeTierFlag(
  providerId: ProviderId,
  upstreamId: string,
  freeSlugs: ReadonlySet<string>,
): { core: string; freeTier: boolean } {
  const { core: withoutColonFree, freeTier: colonFree } = stripOpenRouterFreeVariant(upstreamId);
  const tail = withoutColonFree.includes('/') ? withoutColonFree.split('/').pop()! : withoutColonFree;
  const dashFree = tail.toLowerCase().endsWith('-free');
  let core = withoutColonFree;
  if (dashFree) {
    core = withoutColonFree.replace(/-free$/i, '');
  }
  const freeTier =
    colonFree ||
    dashFree ||
    isFreeTierUpstreamSlug(tail, freeSlugs) ||
    (providerId !== 'openrouter' && tail.toLowerCase().includes('free'));
  return { core, freeTier };
}

export function encodePontModelIdFromUpstream(
  providerId: ProviderId,
  upstreamId: string,
  freeSlugs: ReadonlySet<string>,
): string {
  const { core, freeTier } = upstreamFreeTierFlag(providerId, upstreamId, freeSlugs);
  return encodePontModelId(providerId, core, { freeTier });
}

export function encodePontModelId(
  providerId: ProviderId,
  upstreamId: string,
  options?: { freeTier?: boolean },
): string {
  const prefix = pontPrefixForProvider(providerId);
  const base = `${prefix}-${normalizeUpstreamSlugForPont(upstreamId)}`;
  if (!options?.freeTier) {
    return base;
  }
  if (base.toLowerCase().endsWith('-free')) {
    return base;
  }
  return `${base}-free`;
}

export function isFreeTierUpstreamSlug(slug: string, freeSlugs: ReadonlySet<string>): boolean {
  return freeSlugs.has(slug.toLowerCase());
}
