import { codexFiles, installCodex } from '../install/codex.js';
import type { ContextbookAdapter } from './types.js';

export const codexAdapter: ContextbookAdapter = {
  id: 'codex',
  displayName: 'Codex',
  install: installCodex,
  files: codexFiles
};
