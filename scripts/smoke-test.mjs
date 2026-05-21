import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'contextbook-smoke-'));
const home = await mkdtemp(join(tmpdir(), 'contextbook-home-'));
const cli = new URL('../dist/cli.js', import.meta.url).pathname;

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
    ...options
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`Command failed: contextbook ${args.join(' ')}`);
  }
  return result.stdout;
}

try {
  run(['init']);
  await mkdir(join(root, 'src', 'hooks'), { recursive: true });
  await writeFile(join(root, 'src', 'hooks', 'useWorkflowSSE.ts'), `import { useEffect } from 'react';\nexport function useWorkflowSSE(url: string) {\n  useEffect(() => {\n    const source = new EventSource(url);\n    return () => source.close();\n  }, [url]);\n}\n`, 'utf8');
  run(['scan']);
  const learn = run(['learn']);
  if (!learn.includes('useEffect cleanup') && !learn.includes('SSE')) throw new Error('learn did not include expected concepts');
  const why = run(['why', 'cleanup 왜 해야 돼?']);
  for (const heading of ['## 근거 수준', '## 프로젝트 말로 설명', '## 쉬운 말', '## 개발자 용어', '## CS 연결', '## 면접 문장', '## 근거 파일']) {
    if (!why.includes(heading)) throw new Error(`why missing ${heading}`);
  }
  run(['profile']);
  console.log('smoke test passed');
} finally {
  await rm(root, { recursive: true, force: true });
  if (!home.startsWith(homedir())) await rm(home, { recursive: true, force: true });
}
