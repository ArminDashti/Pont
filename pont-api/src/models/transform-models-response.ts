import { encodePontModelIdFromUpstream } from './pont-model-id.js';
import type { ProviderId } from '../providers/provider-definitions.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function transformModelsListJson(
  bodyText: string,
  providerId: ProviderId,
  freeSlugs: ReadonlySet<string>,
): string {
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
      return bodyText;
    }
    const data = parsed.data.map((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') {
        return item;
      }
      const pontId = encodePontModelIdFromUpstream(providerId, item.id, freeSlugs);
      return { ...item, id: pontId };
    });
    return JSON.stringify({ ...parsed, data });
  } catch {
    return bodyText;
  }
}
