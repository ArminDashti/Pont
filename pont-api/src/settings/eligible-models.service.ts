import { BadRequestException, Injectable } from '@nestjs/common';

import { parsePontModelId } from '../models/pont-model-id.js';
import type { ProviderId } from '../providers/provider-definitions.js';
import { SettingsRepository } from '../store/settings.repository.js';
import { UserModelsRepository } from '../store/user-models.repository.js';

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
  constructor(
    private readonly settings: SettingsRepository,
    private readonly userModels: UserModelsRepository,
  ) {}

  private explicitEnabled(): string[] | null {
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

  /** Gateway allowlist plus optional per-user grant list (unset user grant = all gateway-eligible). */
  isEnabledForUser(username: string, modelId: string): boolean {
    if (!this.isEnabled(modelId)) {
      return false;
    }
    if (!this.userModels.hasAssignment(username)) {
      return true;
    }
    return this.userModels.listModelIds(username).includes(modelId.trim());
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

  assertEligibleForUser(username: string, modelId: string | undefined): void {
    if (!modelId?.trim()) {
      return;
    }
    if (!parsePontModelId(modelId)) {
      return;
    }
    if (!this.isEnabledForUser(username, modelId)) {
      throw new BadRequestException('Model is not allowed for this user');
    }
  }

  /** Test and migration hook; no public admin API. */
  setEnabled(modelIds: string[]): string[] {
    const unique = [...new Set(modelIds.map((id) => id.trim()).filter(Boolean))];
    this.settings.set(STORAGE_KEY, JSON.stringify(unique));
    return unique;
  }

  private rowsForCatalog(catalog: Array<{ id: string; providerId: ProviderId }>): EligibleModelRow[] {
    const explicit = this.explicitEnabled();
    return catalog.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      enabled: explicit ? explicit.includes(row.id) : row.providerId === 'opencode-go',
    }));
  }

  rowsForUserCatalog(username: string, catalog: Array<{ id: string; providerId: ProviderId }>): EligibleModelRow[] {
    const gatewayRows = this.rowsForCatalog(catalog);
    if (!this.userModels.hasAssignment(username)) {
      return gatewayRows;
    }
    const granted = new Set(this.userModels.listModelIds(username));
    return gatewayRows.map((row) => ({
      ...row,
      enabled: row.enabled && granted.has(row.id),
    }));
  }

  userAssignmentCustomized(username: string): boolean {
    return this.userModels.hasAssignment(username);
  }

  setUserEnabled(username: string, modelIds: string[]): string[] {
    const unique = [...new Set(modelIds.map((id) => id.trim()).filter(Boolean))];
    for (const modelId of unique) {
      if (!parsePontModelId(modelId)) {
        throw new BadRequestException(`Unknown model id "${modelId}"`);
      }
      if (!this.isEnabled(modelId)) {
        throw new BadRequestException(`Model "${modelId}" is not enabled on this gateway`);
      }
    }
    return this.userModels.setModelIds(username, unique);
  }

  filterModelsListJson(bodyText: string, username?: string): string {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
        return bodyText;
      }
      const data = parsed.data.filter((item) => {
        if (!isRecord(item) || typeof item.id !== 'string') {
          return true;
        }
        return username ? this.isEnabledForUser(username, item.id) : this.isEnabled(item.id);
      });
      return JSON.stringify({ ...parsed, data });
    } catch {
      return bodyText;
    }
  }
}
