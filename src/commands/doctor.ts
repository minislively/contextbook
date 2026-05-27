import { buildDoctor, formatDoctorMarkdown } from '../core/doctor.js';

export async function doctorCommand(args: string[] = []): Promise<void> {
  const json = parseDoctorArgs(args);
  const result = await buildDoctor();
  console.log(json ? JSON.stringify(result, null, 2) : formatDoctorMarkdown(result));
}

function parseDoctorArgs(args: string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--json') return true;
  throw new Error('Usage: contextbook doctor [--json]');
}
