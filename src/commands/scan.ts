import { scanProject } from '../core/scan.js';

export async function scanCommand(): Promise<void> {
  const result = await scanProject();
  console.log(`Scanned ${result.filesScanned} files.`);
  console.log(`Detected ${result.conceptsDetected} concepts and ${result.evidenceDetected} evidence records.`);
  if (result.changedFiles) console.log(`Changed files considered: ${result.changedFiles}`);
}
