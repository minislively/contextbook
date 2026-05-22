import { codexFiles, installCodex } from './install.js';
import type { ContextbookAdapter } from '../integrations/types.js';

export const codexAdapter: ContextbookAdapter = {
  id: 'codex',
  displayName: 'Codex',
  install: installCodex,
  files: codexFiles
};
