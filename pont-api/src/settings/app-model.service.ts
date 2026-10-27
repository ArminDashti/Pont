import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { SettingsRepository } from '../store/settings.repository.js';

/** Client apps that each pick their own model: Chat (Open WebUI), Agent (nanobot), Extension (Nanobrowser). */
export const MODEL_APPS = ['chat', 'agent', 'extension'] as const;
export type ModelApp = (typeof MODEL_APPS)[number];

export interface AppModelSelection {
  providerId: string;
  modelId: string;
}

export interface AppModelStatus {
  app: ModelApp;
  selection: AppModelSelection | null;
}

function storageKey(app: ModelApp): string {
  return `app-model.${app}`;
}

/** Stores the provider and model each client app uses, separately per app. */
@Injectable()
export class AppModelService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly registry: ProviderRegistry,
  ) {}

  get(app: string): AppModelStatus {
    const known = this.assertKnown(app);
    const raw = this.settings.get(storageKey(known));
    return { app: known, selection: raw ? (JSON.parse(raw) as AppModelSelection) : null };
  }

  /** Saves the selection; empty provider and model clear it. */
  set(app: string, providerId: string, modelId: string): AppModelStatus {
    const known = this.assertKnown(app);
    const provider = providerId.trim();
    const model = modelId.trim();
    if (!provider && !model) {
      this.settings.delete(storageKey(known));
      return { app: known, selection: null };
    }
    if (!provider || !model) {
      throw new BadRequestException('Both "providerId" and "modelId" are required');
    }
    this.registry.get(provider);
    const selection: AppModelSelection = { providerId: provider, modelId: model };
    this.settings.set(storageKey(known), JSON.stringify(selection));
    return { app: known, selection };
  }

  private assertKnown(app: string): ModelApp {
    if (!(MODEL_APPS as readonly string[]).includes(app)) {
      throw new NotFoundException(`Unknown model app "${app}"`);
    }
    return app as ModelApp;
  }
}
