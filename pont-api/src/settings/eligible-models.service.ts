import { BadRequestException, Injectable } from '@nestjs/common';

import { parsePontModelId } from '../models/pont-model-id.js';
import type { ProviderId } from '../providers/provider-definitions.js';
import { SettingsRepository } from '../store/settings.repository.js';

const STORAGE_KEY = 'eligible-models.enabled';

export interface EligibleModelRow {
  id: string;
  providerId: ProviderId;
  enabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Gateway allowlist for Pont model ids; unset means OpenCode Go only. */
@Injectable()
export class EligibleModelsService {
  constructor(private readonly settings: SettingsRepository) {}

  /** Saved explicit list, or null when the OpenCode Go–only default applies. */
  explicitEnabled(): string[] | null {
    const raw = this.settings.get(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as string[];
  }

  isEnabled(modelId: string): boolean {
    const id = modelId.trim();
    const parsed = parsePontModelId(id);
    if (!parsed) {
      return false;
    }
    const explicit = this.explicitEnabled();
    if (!explicit) {
      return parsed.providerId === 'opencode-go';
    }
    return explicit.includes(id);
  }

  assertEligible(modelId: string | undefined): void {
    if (!modelId?.trim()) {
      return;
    }
    if (!parsePontModelId(modelId)) {
      return;
    }
    if (!this.isEnabled(modelId)) {
      throw new BadRequestException('Model is not eligible for this gateway');
    }
  }

  setEnabled(modelIds: string[]): string[] {
    const unique = [...new Set(modelIds.map((id) => id.trim()).filter(Boolean))];
    this.settings.set(STORAGE_KEY, JSON.stringify(unique));
    return unique;
  }

  rowsForCatalog(catalog: Array<{ id: string; providerId: ProviderId }>): EligibleModelRow[] {
    const explicit = this.explicitEnabled();
    return catalog.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      enabled: explicit ? explicit.includes(row.id) : row.providerId === 'opencode-go',
    }));
  }

  filterModelsListJson(bodyText: string): string {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
        return bodyText;
      }
      const data = parsed.data.filter((item) => {
        if (!isRecord(item) || typeof item.id !== 'string') {
          return true;
        }
        return this.isEnabled(item.id);
      });
      return JSON.stringify({ ...parsed, data });
    } catch {
      return bodyText;
    }
  }
}
