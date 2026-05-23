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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

try {
  const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
  for (const text of ['contextbook setup', 'contextbook setup --dry-run', 'contextbook project', 'contextbook profile diff', 'contextbook profile edit', 'contextbook profile reset', 'contextbook install all --dry-run', 'contextbook install codex --dry-run', 'contextbook install codex --codex-path both --dry-run', 'contextbook install claude-code --dry-run']) {
    assert(readme.includes(text), `README missing ${text}`);
  }

  const help = run(['--help'], { cwd: repoRoot });
  for (const text of ['contextbook project', 'contextbook profile diff', 'contextbook profile edit', 'contextbook profile reset', 'contextbook setup', 'contextbook setup --dry-run', 'contextbook install all [--dry-run] [--codex-path auto|agents|codex|both]', 'contextbook install codex [--dry-run] [--codex-path auto|agents|codex|both]', 'contextbook install claude-code [--dry-run]']) {
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

  const projectBeforeInit = run(['project']);
  assert(projectBeforeInit.includes('# Project Memory'), 'project before init missing heading');
  assert(projectBeforeInit.includes('Contextbook 메모리를 찾지 못했습니다'), 'project before init should explain missing memory');
  assert(projectBeforeInit.includes('contextbook init') && projectBeforeInit.includes('contextbook scan'), 'project before init missing next action hints');
  assert(!existsSync(join(root, '.contextbook')), 'project command should be read-only before init');

  run(['init']);
  const initialFileIndex = await readJson(join(root, '.contextbook', 'project', 'file-index.json'));
  assert(initialFileIndex.schemaVersion === 1, 'initial file index missing schema version');
  assert(initialFileIndex.totals.scanned === 0 && initialFileIndex.totals.skipped === 0, 'initial file index should have zero totals');
  assert(Array.isArray(initialFileIndex.files) && initialFileIndex.files.length === 0, 'initial file index should have no files');

  await mkdir(join(root, 'src', 'assets'), { recursive: true });
  await mkdir(join(root, 'zz-unsupported'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, '.env'), 'SECRET_TOKEN=should-not-leak\n', 'utf8');
  await writeFile(join(root, 'src', 'assets', 'logo.png'), 'unsupported image placeholder\n', 'utf8');
  await writeFile(join(root, 'src', 'hooks', 'large-fixture.ts'), 'x'.repeat(300_001), 'utf8');
  await writeFile(join(root, 'dist', 'generated.js'), 'export const hidden = "ignored";\n', 'utf8');
  for (let index = 0; index < 1010; index += 1) {
    await writeFile(join(root, 'zz-unsupported', `unsupported-${index}.bin`), 'unsupported\n', 'utf8');
  }
  await writeFile(join(root, 'src', 'hooks', 'useWorkflowSSE.ts'), `import { useEffect } from 'react';\nexport function useWorkflowSSE(url: string) {\n  useEffect(() => {\n    const source = new EventSource(url);\n    return () => source.close();\n  }, [url]);\n}\n`, 'utf8');

  run(['scan']);
  const core = await import('../dist/core/index.js');
  const rankedFixtures = core.rankLearningMoments([
    {
      id: 'five-one-source',
      label: 'B concept',
      evidenceLevel: 'direct',
      signals: Array.from({ length: 5 }, (_, index) => ({
        conceptId: 'five-one-source',
        evidenceLevel: 'direct',
        file: `src/a-${index}.ts`,
        signal: 'signal',
        reason: 'fixture',
        detectedAt: new Date(0).toISOString(),
        source: 'content'
      })),
      connectedConcepts: [],
      interviewQuestion: 'fixture?',
      updatedAt: new Date(0).toISOString()
    },
    {
      id: 'four-varied-sources',
      label: 'A concept',
      evidenceLevel: 'direct',
      signals: ['content', 'package', 'file-name', 'function-name'].map((source, index) => ({
        conceptId: 'four-varied-sources',
        evidenceLevel: 'direct',
        file: `src/b-${index}.ts`,
        signal: 'signal',
        reason: 'fixture',
        detectedAt: new Date(0).toISOString(),
        source
      })),
      connectedConcepts: [],
      interviewQuestion: 'fixture?',
      updatedAt: new Date(0).toISOString()
    },
    {
      id: 'changed-low-score',
      label: 'Changed concept',
      evidenceLevel: 'general',
      signals: [{
        conceptId: 'changed-low-score',
        evidenceLevel: 'general',
        file: 'src/changed.ts',
        signal: 'signal',
        reason: 'fixture',
        detectedAt: new Date(0).toISOString(),
        source: 'content'
      }],
      connectedConcepts: [],
      interviewQuestion: 'fixture?',
      updatedAt: new Date(0).toISOString()
    }
  ], new Set(['src/changed.ts']));
  assert(rankedFixtures[0].concept.id === 'changed-low-score', 'changed-file-backed ranking fixture should rank first');
  assert(rankedFixtures[1].score >= rankedFixtures[2].score, 'ranking fixtures should be ordered by public score after changed precedence');
  assert(rankedFixtures[1].concept.id === 'four-varied-sources', 'score should be the canonical ranking key after changed precedence');

  const coreLearn = await core.buildLearningMoments({ root, learner: 'default' });
  assert(coreLearn.markdown.includes('# Daily Learning Card'), 'core learn contract did not return markdown');
  assert(Array.isArray(coreLearn.concepts), 'core learn contract did not return concepts');
  assert(Array.isArray(coreLearn.moments), 'core learn contract did not return ranked moments');
  assert(coreLearn.moments.length >= 1 && coreLearn.moments.length <= 3, 'core learn moments should include 1-3 items');
  assert(coreLearn.moments.every((moment) => moment.concept && typeof moment.score === 'number' && Array.isArray(moment.reasons) && moment.reasons.length > 0), 'core learn moments missing ranking reasons');
  assert(coreLearn.moments.every((moment) => moment.reasons.every((reason) => reason.code && reason.label && reason.detail)), 'core learn reason shape invalid');
  assert(coreLearn.moments[0].concept.signals.some((signal) => signal.changed === true), 'changed-file-backed concept should rank first');
  assert(coreLearn.moments[0].reasons.some((reason) => reason.code === 'changed-file'), 'first moment missing changed-file ranking reason');
  assert(coreLearn.markdown.includes('추천 이유:'), 'core learn markdown missing ranking reasons');
  const serializedMoments = JSON.stringify(coreLearn.moments);
  assert(!serializedMoments.includes(root) && !serializedMoments.includes(home), 'ranking moments stored absolute local path');
  assert(!serializedMoments.includes('SECRET_TOKEN') && !serializedMoments.includes('should-not-leak'), 'ranking moments stored hidden file content');
  assert(!serializedMoments.includes('EventSource should be ignored'), 'ranking moments stored hidden runtime content');
  const evidence = await readJsonl(join(root, '.contextbook', 'project', 'evidence.jsonl'));
  assert(evidence.some((item) => item.source === 'content'), 'missing content evidence');
  assert(!evidence.some((item) => item.file?.startsWith('.fooks/')), 'scanner included hidden runtime directory evidence');
  assert(evidence.some((item) => item.source === 'package'), 'missing package evidence');
  assert(evidence.some((item) => item.source === 'file-name' || item.source === 'function-name'), 'missing file/function evidence');
  assert(evidence.some((item) => item.changed === true), 'missing changed-file evidence');
  const fileIndex = await readJson(join(root, '.contextbook', 'project', 'file-index.json'));
  assert(fileIndex.schemaVersion === 1, 'file index missing schema version');
  assert(typeof fileIndex.generatedAt === 'string' && !Number.isNaN(Date.parse(fileIndex.generatedAt)), 'file index missing generated timestamp');
  assert(fileIndex.rootName && !fileIndex.rootName.includes('/'), 'file index root name should be basename only');
  assert(fileIndex.totals.scanned > 0 && fileIndex.totals.bytesScanned > 0, 'file index missing scan totals');
  assert(fileIndex.totals.skipped > 0, 'file index missing skipped totals');
  assert(fileIndex.files.some((item) => item.path === 'README.md' && item.status === 'scanned'), 'file index missing README scanned entry');
  assert(fileIndex.files.some((item) => item.path === 'package.json' && item.status === 'scanned'), 'file index missing package scanned entry');
  assert(fileIndex.files.some((item) => item.path === 'src/hooks/useWorkflowSSE.ts' && item.status === 'scanned'), 'file index missing hook scanned entry');
  assert(fileIndex.files.some((item) => item.path === '.fooks/' && item.kind === 'directory' && item.status === 'skipped' && item.reason === 'hidden-dir'), 'file index missing hidden directory skip');
  assert(fileIndex.files.some((item) => item.path === 'dist/' && item.kind === 'directory' && item.status === 'skipped' && item.reason === 'ignored-dir'), 'file index missing ignored directory skip');
  assert(fileIndex.files.some((item) => item.path === 'src/assets/logo.png' && item.status === 'skipped' && item.reason === 'unsupported-extension'), 'file index missing unsupported extension skip');
  assert(fileIndex.files.some((item) => item.path === 'src/hooks/large-fixture.ts' && item.status === 'skipped' && item.reason === 'large-file'), 'file index missing large file skip');
  assert(!fileIndex.files.some((item) => item.path === '.fooks/sessions/hidden-runtime.json'), 'file index enumerated hidden directory contents');
  assert(fileIndex.files.filter((item) => item.status === 'skipped').length <= 1000, 'file index should cap skipped entries');
  assert(!fileIndex.files.some((item) => item.path === '.env'), 'file index recorded hidden file name');
  const fileIndexJson = JSON.stringify(fileIndex);
  assert(!fileIndexJson.includes(root) && !fileIndexJson.includes(home), 'file index stored absolute local path');
  assert(!fileIndexJson.includes('EventSource should be ignored'), 'file index stored hidden file content');
  assert(!fileIndexJson.includes('SECRET_TOKEN') && !fileIndexJson.includes('should-not-leak'), 'file index stored hidden file content');
  assert(!fileIndexJson.includes('conversation-memory') && !fileIndexJson.includes('profile.view'), 'file index stored learner/conversation data');
  const scanRuns = await readJsonl(join(root, '.contextbook', 'project', 'scan-runs.jsonl'));
  assert(scanRuns.length === 1, 'scan should append exactly one scan run record');
  const scanRun = scanRuns[0];
  assert(scanRun.schemaVersion === 1, 'scan run missing schema version');
  assert(typeof scanRun.scanId === 'string' && scanRun.scanId.startsWith('scan-'), 'scan run missing id');
  assert(typeof scanRun.scannedAt === 'string' && !Number.isNaN(Date.parse(scanRun.scannedAt)), 'scan run missing timestamp');
  assert(scanRun.filesScanned > 0 && scanRun.bytesScanned > 0, 'scan run missing scan size fields');
  assert(scanRun.changedFiles >= 1, 'scan run missing changed-file count');
  assert(scanRun.conceptsDetected >= 1 && scanRun.evidenceDetected >= 1, 'scan run missing detection counts');
  assert(Array.isArray(scanRun.warnings), 'scan run warnings should be an array');
  assert(scanRun.warnings.some((warning) => warning.code === 'scan-partial' && warning.message.includes('hidden file')), 'scan run missing hidden file privacy warning');
  assert(scanRun.warnings.some((warning) => warning.code === 'scan-partial' && warning.message.includes('truncated')), 'scan run missing file index truncation warning');
  assert(scanRun.scannedAt === fileIndex.generatedAt, 'scan run timestamp should align with file index');
  assert(scanRun.filesScanned === fileIndex.totals.scanned, 'scan run filesScanned should align with file index');
  assert(scanRun.bytesScanned === fileIndex.totals.bytesScanned, 'scan run bytesScanned should align with file index');
  const scanRunJson = JSON.stringify(scanRun);
  assert(!scanRunJson.includes(root) && !scanRunJson.includes(home), 'scan run stored absolute local path');

  const coreProject = await core.buildProjectSummary({ root });
  assert(coreProject.markdown.includes('# Project Memory'), 'core project contract did not return markdown');
  assert(Array.isArray(coreProject.memoryFiles) && coreProject.memoryFiles.length >= 5, 'core project contract missing memory file statuses');
  assert(coreProject.memoryFiles.every((file) => !file.path.includes(root) && file.path.startsWith('.contextbook/project/')), 'project memory status should use safe relative paths');
  assert(coreProject.concepts.length >= 1, 'core project summary missing concepts');
  assert(coreProject.recentScanRuns.length === 1, 'core project summary missing recent scan run');
  assert(coreProject.evidenceCount >= 1, 'core project summary missing evidence count');
  const project = run(['project']);
  for (const heading of ['# Project Memory', '## Memory Files', '## Top Concepts', '## Recent Scan Runs', '## Next Action Hints']) {
    assert(project.includes(heading), `project missing ${heading}`);
  }
  assert(project.includes('useEffect cleanup') || project.includes('SSE'), 'project did not include expected concepts');
  assert(project.includes('warnings'), 'project did not surface scan warning count');
  assert(!project.includes(root) && !project.includes(home), 'project output included absolute local path');
  assert(!project.includes('SECRET_TOKEN') && !project.includes('should-not-leak'), 'project output included hidden file content');
  assert(!existsSync(join(root, '.contextbook', 'project', 'summary.json')), 'project created a persisted summary artifact');

  run(['scan']);
  const scanRunsAfterSecondScan = await readJsonl(join(root, '.contextbook', 'project', 'scan-runs.jsonl'));
  assert(scanRunsAfterSecondScan.length === 2, 'scan should append one scan run record per invocation');
  const fileIndexAfterSecondScan = await readJson(join(root, '.contextbook', 'project', 'file-index.json'));
  assert(fileIndexAfterSecondScan.generatedAt === scanRunsAfterSecondScan[1].scannedAt, 'file index should be replaced with latest scan snapshot');

  const learn = run(['learn']);
  assert(learn.includes('# Daily Learning Card'), 'learn did not frame output as daily card');
  assert(learn.includes('추천 이유:'), 'learn did not include ranking reasons');
  assert(learn.includes('변경 파일 근거: yes'), 'learn did not include changed-file marker');
  assert(learn.includes('useEffect cleanup') || learn.includes('SSE'), 'learn did not include expected concepts');
  assert(!learn.includes(root) && !learn.includes(home), 'learn output included absolute local path');
  assert(!learn.includes('SECRET_TOKEN') && !learn.includes('should-not-leak'), 'learn output included hidden file content');
  assert(!existsSync(join(root, '.contextbook', 'project', 'ranking-reasons.json')), 'learn created a ranking-reasons project memory artifact');

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

  const profileOutput = run(['profile']);
  assert(profileOutput.includes('## Conversation Memory'), 'profile did not expose conversation memory summary');
  assert(profileOutput.includes('원문 전체 대화 저장 없음'), 'profile did not show conversation memory safety boundary');
  run(['profile', 'diff']);
  const editNoEditor = run(['profile', 'edit']);
  assert(editNoEditor.includes('Profile path'), 'profile edit without EDITOR did not show path guidance');
  run(['profile', 'edit'], { env: { ...process.env, HOME: home, USERPROFILE: home, EDITOR: 'true' } });
  run(['profile', 'reset']);

  const signals = await readJsonl(join(learnerDir, 'signals.jsonl'));
  for (const type of ['scan', 'learn', 'why', 'profile.view', 'profile.diff', 'profile.edit.path-shown', 'profile.edit', 'profile.reset']) {
    assert(signals.some((item) => item.type === type), `signals.jsonl missing ${type}`);
  }
  for (const signalType of ['scan.completed', 'learn.generated', 'why.answered', 'profile.viewed']) {
    assert(signals.some((item) => item.schemaVersion === 1 && item.kind === 'conversation-memory' && item.signalType === signalType), `signals.jsonl missing structured ${signalType}`);
  }
  assert(!signals.some((item) => /beginner|low ability|이해력이 낮/.test(JSON.stringify(item))), 'signals include unsafe learner judgment');
  const answers = await readJsonl(join(learnerDir, 'answers.jsonl'));
  assert(answers.some((item) => item.question?.includes('cleanup')), 'answers.jsonl missing why answer');
  assert(answers.some((item) => item.schemaVersion === 1 && item.kind === 'conversation-memory' && item.signalType === 'why.answered'), 'answers.jsonl missing structured why answer');
  const profileUpdates = await readJsonl(join(learnerDir, 'profile-updates.jsonl'));
  assert(profileUpdates.some((item) => item.type === 'profile.edit'), 'profile-updates missing edit');
  assert(profileUpdates.some((item) => item.type === 'profile.reset'), 'profile-updates missing reset');
  assert(profileUpdates.every((item) => item.kind === 'conversation-memory'), 'profile-updates should use structured conversation memory events');
  const projectEvidence = await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8');
  assert(!projectEvidence.includes('profile.view') && !projectEvidence.includes('profile.reset'), 'project memory contains learner signals');

  const codexSkill = join(home, '.codex', 'skills', 'contextbook', 'SKILL.md');
  const codexLegacySkill = join(home, '.agents', 'skills', 'contextbook', 'SKILL.md');
  const claudeSkill = join(home, '.claude', 'skills', 'contextbook', 'SKILL.md');
  const claudeLearn = join(home, '.claude', 'commands', 'contextbook-learn.md');
  const claudeWhy = join(home, '.claude', 'commands', 'contextbook-why.md');

  const setupDryRun = run(['setup', '--dry-run']);
  assert(setupDryRun.includes('# Contextbook setup (dry run)'), 'setup dry-run did not show setup heading');
  assert(setupDryRun.includes('# Contextbook codex install (dry run)') && setupDryRun.includes('# Contextbook claude-code install (dry run)'), 'setup dry-run did not preview both adapters');
  assert(setupDryRun.includes('.codex') && setupDryRun.includes('.claude'), 'setup dry-run did not show codex and claude target paths');
  assert(!existsSync(codexSkill) && !existsSync(claudeSkill), 'setup dry-run wrote files');

  const allDryRun = run(['install', 'all', '--dry-run']);
  assert(allDryRun.includes('# Contextbook codex install (dry run)') && allDryRun.includes('# Contextbook claude-code install (dry run)'), 'install all dry-run did not preview both adapters');
  assert(allDryRun.includes('.codex') && allDryRun.includes('.claude'), 'install all dry-run did not show codex and claude target paths');
  assert(!existsSync(codexSkill) && !existsSync(claudeSkill), 'install all dry-run wrote files');

  const codexDryRun = run(['install', 'codex', '--dry-run']);
  assert(codexDryRun.includes('would create'), 'codex dry-run did not preview create');
  assert(codexDryRun.includes('.codex'), 'codex dry-run did not default to canonical Codex/OMX skills path');
  assert(!existsSync(codexSkill), 'codex dry-run wrote a file');
  const codexLegacyDryRun = run(['install', 'codex', '--codex-path', 'agents', '--dry-run']);
  assert(codexLegacyDryRun.includes('.agents'), 'codex historical agents dry-run did not preview .agents compatibility path');
  assert(!existsSync(codexLegacySkill), 'codex legacy dry-run wrote a file');
  const codexBothDryRun = run(['install', 'codex', '--codex-path=both', '--dry-run']);
  assert(codexBothDryRun.includes('.agents') && codexBothDryRun.includes('.codex'), 'codex both dry-run did not preview both paths');
  assert(!existsSync(codexSkill) && !existsSync(codexLegacySkill), 'codex both dry-run wrote a file');
  const legacyAutoHome = join(home, 'legacy-auto-home');
  await mkdir(join(legacyAutoHome, '.codex', 'skills'), { recursive: true });
  assert(core.codexFiles(legacyAutoHome)[0].path.includes('.codex'), 'codex auto mode did not default to canonical .codex skills path');
  const claudeDryRun = run(['install', 'claude-code', '--dry-run']);
  assert(claudeDryRun.includes('would create'), 'claude dry-run did not preview create');
  assert(!existsSync(claudeSkill) && !existsSync(claudeLearn) && !existsSync(claudeWhy), 'claude dry-run wrote files');

  const setupInstall = run(['setup']);
  assert(setupInstall.includes('# Contextbook setup') && setupInstall.includes('created'), 'setup did not install helper files');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook learn'), 'setup codex skill missing learn guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook why'), 'setup claude skill missing why guidance');

  const codexInstall = run(['install', 'codex']);
  assert(codexInstall.includes('skipped identical'), 'codex install after setup did not skip identical file');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook learn'), 'codex skill missing learn guidance');
  const codexInstallAgain = run(['install', 'codex']);
  assert(codexInstallAgain.includes('skipped identical'), 'codex reinstall did not skip identical file');
  const codexLegacyInstall = run(['install', 'codex', '--codex-path', 'agents']);
  assert(codexLegacyInstall.includes('created'), 'codex explicit historical agents install did not create compatibility file');
  assert((await readFile(codexLegacySkill, 'utf8')).includes('contextbook learn'), 'codex legacy skill missing learn guidance');

  const claudeInstall = run(['install', 'claude-code']);
  assert(claudeInstall.includes('skipped identical'), 'claude install after setup did not skip identical files');
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
