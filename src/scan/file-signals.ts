import type { ConceptRecord } from '../types.js';

export function preferChangedFiles(concepts: ConceptRecord[], changed: Set<string>): ConceptRecord[] {
  if (changed.size === 0) return concepts;
  return [...concepts].sort((a, b) => {
    const aChanged = a.signals.some((signal) => signal.file && changed.has(signal.file)) ? 1 : 0;
    const bChanged = b.signals.some((signal) => signal.file && changed.has(signal.file)) ? 1 : 0;
    return bChanged - aChanged;
  });
}
