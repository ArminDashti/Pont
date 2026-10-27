import { type JsonObject } from './anthropic-bridge/json.js';

/** Sampling params newer Claude models reject upstream ("temperature is deprecated for this model"). */
const SAMPLING_PARAMS = ['temperature', 'top_p', 'top_k'] as const;

/** Minimum (major, minor) per Claude family from which sampling params are rejected. */
const SAMPLING_DEPRECATED_FROM: Record<string, [number, number]> = {
  haiku: [5, 5],
  sonnet: [5, 0],
  opus: [4, 7],
  fable: [5, 0],
  mythos: [5, 0],
};

export function rejectsSamplingParams(model: unknown): boolean {
  if (typeof model !== 'string') return false;
  const match = /^(?:[\w-]+\/)?claude-(haiku|sonnet|opus|fable|mythos)-(\d+)(?:[-.](\d+))?/i.exec(model.trim());
  if (!match) return false;
  const min = SAMPLING_DEPRECATED_FROM[match[1].toLowerCase()];
  const major = Number(match[2]);
  const minor = Number(match[3] ?? 0);
  return major > min[0] || (major === min[0] && minor >= min[1]);
}

/** Returns a copy without sampling params when the model rejects them; otherwise the same object. */
export function stripUnsupportedSampling(body: JsonObject): { body: JsonObject; changed: boolean } {
  if (!rejectsSamplingParams(body.model)) return { body, changed: false };
  const copy: JsonObject = { ...body };
  let changed = false;
  for (const key of SAMPLING_PARAMS) {
    if (key in copy) {
      delete copy[key];
      changed = true;
    }
  }
  return { body: changed ? copy : body, changed };
}