import { mkdtemp, writeFile, mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'contextbook-smoke-'));
const home = await mkdtemp(join(tmpdir(), 'contextbook-home-'));
const repoRoot = new URL('..', import.meta.url).pathname;
const cli = new URL('../dist/cli.js', import.meta.url).pathname;
const learnerDir = join(home, '.contextbook', 'learners', 'default');

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home, EDITOR: '' },
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

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`git ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJsonl(path) {
  const raw = await readFile(path, 'utf8');
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

try {
  const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
  for (const text of ['contextbook profile diff', 'contextbook profile edit', 'contextbook profile reset', 'contextbook install codex --dry-run', 'contextbook install claude-code --dry-run']) {
    assert(readme.includes(text), `README missing ${text}`);
  }

  const help = run(['--help'], { cwd: repoRoot });
  for (const text of ['contextbook profile diff', 'contextbook profile edit', 'contextbook profile reset', 'contextbook install codex [--dry-run]', 'contextbook install claude-code [--dry-run]']) {
    assert(help.includes(text), `help missing ${text}`);
  }

  git(['init']);
  git(['config', 'user.email', 'smoke@example.test']);
  git(['config', 'user.name', 'Contextbook Smoke']);
  await writeFile(join(root, 'README.md'), '# Smoke project\n', 'utf8');
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { zustand: '^5.0.0' } }, null, 2), 'utf8');
  await mkdir(join(root, 'src', 'hooks'), { recursive: true });
  await mkdir(join(root, '.fooks', 'sessions'), { recursive: true });
  await writeFile(join(root, '.fooks', 'sessions', 'hidden-runtime.json'), JSON.stringify({ event: 'EventSource should be ignored' }), 'utf8');
  await writeFile(join(root, 'src', 'hooks', 'useWorkflowSSE.ts'), `export function useWorkflowSSE(url: string) {\n  return url;\n}\n`, 'utf8');
  git(['add', '.']);
  git(['commit', '-m', 'baseline']);

  run(['init']);
  await writeFile(join(root, 'src', 'hooks', 'useWorkflowSSE.ts'), `import { useEffect } from 'react';\nexport function useWorkflowSSE(url: string) {\n  useEffect(() => {\n    const source = new EventSource(url);\n    return () => source.close();\n  }, [url]);\n}\n`, 'utf8');

  run(['scan']);
  const core = await import('../dist/core/index.js');
  const coreLearn = await core.buildLearningMoments({ root, learner: 'default' });
  assert(coreLearn.markdown.includes('# Daily Learning Card'), 'core learn contract did not return markdown');
  assert(Array.isArray(coreLearn.concepts), 'core learn contract did not return concepts');
  const evidence = await readJsonl(join(root, '.contextbook', 'project', 'evidence.jsonl'));
  assert(evidence.some((item) => item.source === 'content'), 'missing content evidence');
  assert(!evidence.some((item) => item.file?.startsWith('.fooks/')), 'scanner included hidden runtime directory evidence');
  assert(evidence.some((item) => item.source === 'package'), 'missing package evidence');
  assert(evidence.some((item) => item.source === 'file-name' || item.source === 'function-name'), 'missing file/function evidence');
  assert(evidence.some((item) => item.changed === true), 'missing changed-file evidence');

  const learn = run(['learn']);
  assert(learn.includes('# Daily Learning Card'), 'learn did not frame output as daily card');
  assert(learn.includes('변경 파일 근거: yes'), 'learn did not include changed-file marker');
  assert(learn.includes('useEffect cleanup') || learn.includes('SSE'), 'learn did not include expected concepts');

  const preferencesPath = join(learnerDir, 'preferences.json');
  await writeFile(preferencesPath, JSON.stringify({
    explanationOrder: ['interview-sentence', 'project', 'plain', 'developer-term', 'cs-link'],
    avoid: []
  }, null, 2), 'utf8');
  const why = run(['why', 'cleanup 왜 해야 돼?']);
  const coreWhy = await core.answerWhy('cleanup 왜 해야 돼?', { root, learner: 'default' });
  assert(coreWhy.markdown.includes('## 근거 수준'), 'core why contract did not return markdown');
  assert(coreWhy.evidenceLevel === 'direct' || coreWhy.evidenceLevel === 'related', 'core why contract did not return project evidence level');
  for (const heading of ['## 근거 수준', '## 프로젝트 말로 설명', '## 쉬운 말', '## 개발자 용어', '## CS 연결', '## 면접 문장', '## 근거 파일']) {
    assert(why.includes(heading), `why missing ${heading}`);
  }
  assert(why.indexOf('## 면접 문장') < why.indexOf('## 프로젝트 말로 설명'), 'why did not apply learner preference ordering');

  run(['profile']);
  run(['profile', 'diff']);
  const editNoEditor = run(['profile', 'edit']);
  assert(editNoEditor.includes('Profile path'), 'profile edit without EDITOR did not show path guidance');
  run(['profile', 'edit'], { env: { ...process.env, HOME: home, USERPROFILE: home, EDITOR: 'true' } });
  run(['profile', 'reset']);

  const signals = await readJsonl(join(learnerDir, 'signals.jsonl'));
  for (const type of ['scan', 'why', 'profile.view', 'profile.diff', 'profile.edit.path-shown', 'profile.edit', 'profile.reset']) {
    assert(signals.some((item) => item.type === type), `signals.jsonl missing ${type}`);
  }
  const answers = await readJsonl(join(learnerDir, 'answers.jsonl'));
  assert(answers.some((item) => item.question?.includes('cleanup')), 'answers.jsonl missing why answer');
  const profileUpdates = await readJsonl(join(learnerDir, 'profile-updates.jsonl'));
  assert(profileUpdates.some((item) => item.type === 'profile.edit'), 'profile-updates missing edit');
  assert(profileUpdates.some((item) => item.type === 'profile.reset'), 'profile-updates missing reset');
  const projectEvidence = await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8');
  assert(!projectEvidence.includes('profile.view') && !projectEvidence.includes('profile.reset'), 'project memory contains learner signals');

  const codexSkill = join(home, '.codex', 'skills', 'contextbook', 'SKILL.md');
  const claudeSkill = join(home, '.claude', 'skills', 'contextbook', 'SKILL.md');
  const claudeLearn = join(home, '.claude', 'commands', 'contextbook-learn.md');
  const claudeWhy = join(home, '.claude', 'commands', 'contextbook-why.md');

  const codexDryRun = run(['install', 'codex', '--dry-run']);
  assert(codexDryRun.includes('would create'), 'codex dry-run did not preview create');
  assert(!existsSync(codexSkill), 'codex dry-run wrote a file');
  const claudeDryRun = run(['install', 'claude-code', '--dry-run']);
  assert(claudeDryRun.includes('would create'), 'claude dry-run did not preview create');
  assert(!existsSync(claudeSkill) && !existsSync(claudeLearn) && !existsSync(claudeWhy), 'claude dry-run wrote files');

  const codexInstall = run(['install', 'codex']);
  assert(codexInstall.includes('created'), 'codex install did not create file');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook learn'), 'codex skill missing learn guidance');
  const codexInstallAgain = run(['install', 'codex']);
  assert(codexInstallAgain.includes('skipped identical'), 'codex reinstall did not skip identical file');

  const claudeInstall = run(['install', 'claude-code']);
  assert(claudeInstall.includes('created'), 'claude install did not create files');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook why'), 'claude skill missing why guidance');
  assert((await readFile(claudeLearn, 'utf8')).includes('contextbook learn'), 'claude learn command missing CLI guidance');
  assert((await readFile(claudeWhy, 'utf8')).includes('$ARGUMENTS'), 'claude why command missing argument placeholder');

  await writeFile(claudeWhy, 'custom user command\n', 'utf8');
  const claudeUpdate = run(['install', 'claude-code']);
  assert(claudeUpdate.includes('updated with backup'), 'claude changed file was not backed up before update');
  const commandDirEntries = await readdir(join(home, '.claude', 'commands'));
  assert(commandDirEntries.some((entry) => entry.startsWith('contextbook-why.md.bak-')), 'backup file missing for changed claude command');

  const pack = spawnSync('npm', ['pack', '--dry-run'], { cwd: repoRoot, encoding: 'utf8' });
  if (pack.status !== 0) {
    console.error(pack.stdout);
    console.error(pack.stderr);
    throw new Error('npm pack --dry-run failed');
  }
  assert(!pack.stdout.includes('docs/private'), 'npm package includes private docs');
  assert(!pack.stdout.includes('.omx'), 'npm package includes .omx');
  assert(!pack.stdout.includes('.contextbook'), 'npm package includes .contextbook');

  assert(existsSync(join(learnerDir, 'signals.jsonl')), 'learner signals file missing');
  console.log('smoke test passed');
} finally {
  await rm(root, { recursive: true, force: true });
  if (!home.startsWith(homedir())) await rm(home, { recursive: true, force: true });
}
