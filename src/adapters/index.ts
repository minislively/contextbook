import { claudeCodeAdapter } from './claude-code.js';
import { codexAdapter } from './codex.js';
import type { AdapterId, ContextbookAdapter } from './types.js';

export const adapters = [codexAdapter, claudeCodeAdapter] as const satisfies readonly ContextbookAdapter[];
export const adapterIds = adapters.map((adapter) => adapter.id) as AdapterId[];

export function getAdapter(id: string): ContextbookAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id);
}

export { claudeCodeAdapter } from './claude-code.js';
export { codexAdapter } from './codex.js';
export type { AdapterId, ContextbookAdapter } from './types.js';
