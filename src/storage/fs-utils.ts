import { mkdir, readFile, writeFile, access, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!(await exists(path))) return fallback;
  const raw = await readFile(path, 'utf8');
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

export async function writeIfMissing(path: string, content: string): Promise<void> {
  if (await exists(path)) return;
  await ensureDir(dirname(path));
  await writeFile(path, content, 'utf8');
}


export async function readJsonl<T = unknown>(path: string): Promise<T[]> {
  if (!(await exists(path))) return [];
  const raw = await readFile(path, 'utf8');
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export async function appendJsonl(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await appendFile(path, `${JSON.stringify(value)}\n`, 'utf8');
}
