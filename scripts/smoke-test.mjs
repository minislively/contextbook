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

function runExpectFail(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home, EDITOR: '' },
    encoding: 'utf8',
    ...options
  });
  if (result.status === 0) {
    throw new Error(`Command unexpectedly passed: contextbook ${args.join(' ')}`);
  }
  return `${result.stdout}\n${result.stderr}`;
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
  for (const text of ['contextbook setup', 'contextbook setup --dry-run', 'contextbook setup --hooks --dry-run', 'contextbook hooks status', 'contextbook hooks status --json', 'contextbook project', 'contextbook project --json', 'contextbook learner', 'contextbook learner --json', 'contextbook memory add-signal', 'contextbook memory capture-prompt', 'contextbook memory signals --json', 'contextbook memory suggest-weak-terms --json', 'contextbook memory suggest-profile-updates --json', 'contextbook memory apply-profile-update', 'contextbook memory apply-preference-signals', 'contextbook memory context --json', 'contextbook profile diff', 'contextbook profile edit', 'contextbook profile reset', 'contextbook install all --dry-run', 'contextbook install codex --dry-run', 'contextbook install codex --codex-path both --dry-run', 'contextbook install claude-code --dry-run', 'contextbook install codex --hooks --dry-run', 'contextbook install claude-code --hooks --dry-run']) {
    assert(readme.includes(text), `README missing ${text}`);
  }

  const help = run(['--help'], { cwd: repoRoot });
  for (const text of ['contextbook project [--json]', 'contextbook learner [--json]', 'contextbook memory add-signal --type <type> [--concept <concept>] [--note <note>]', 'contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]', 'contextbook memory signals [--json]', 'contextbook memory suggest-weak-terms [--json]', 'contextbook memory suggest-profile-updates [--json]', 'contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]', 'contextbook memory apply-preference-signals --prompt <text> [--source manual|codex|claude-code] [--dry-run] [--json]', 'contextbook memory context [--json]', 'contextbook profile diff', 'contextbook profile edit', 'contextbook profile reset', 'contextbook setup [--dry-run] [--hooks]', 'contextbook hooks status [--json]', 'contextbook install all [--dry-run] [--hooks] [--codex-path auto|agents|codex|both]', 'contextbook install codex [--dry-run] [--hooks] [--codex-path auto|agents|codex|both]', 'contextbook install claude-code [--dry-run] [--hooks]']) {
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
  const projectJsonBeforeInit = JSON.parse(run(['project', '--json']));
  assert(projectJsonBeforeInit.schemaVersion === 1, 'project json before init missing schema version');
  assert(projectJsonBeforeInit.memoryFiles.every((file) => file.exists === false), 'project json before init should mark memory files missing');
  assert(projectJsonBeforeInit.recommendedActions.some((action) => action.command === 'contextbook init'), 'project json before init missing init action');
  assert(projectJsonBeforeInit.recommendedActions.some((action) => action.command === 'contextbook scan'), 'project json before init missing scan action');
  assert(projectJsonBeforeInit.safety.profileMutated === false && projectJsonBeforeInit.safety.persistedSummaryCreated === false, 'project json before init safety flags invalid');
  assert(!existsSync(join(root, '.contextbook')), 'project --json should be read-only before init');
  const projectBadFlag = runExpectFail(['project', '--bad']);
  assert(projectBadFlag.includes('Usage: contextbook project [--json]'), 'project unknown flag missing usage guidance');

  const learnerBeforeWhy = JSON.parse(run(['learner', '--json']));
  assert(learnerBeforeWhy.schemaVersion === 1, 'learner json missing schema version');
  assert(learnerBeforeWhy.learner === 'default', 'learner json missing default learner');
  assert(Array.isArray(learnerBeforeWhy.memoryFiles), 'learner json missing memory files');
  assert(Array.isArray(learnerBeforeWhy.topWeakTerms) && learnerBeforeWhy.topWeakTerms.length === 0, 'learner json before why should have no weak terms');
  assert(learnerBeforeWhy.safety.rawTranscriptIncluded === false, 'learner json raw transcript safety flag invalid');
  assert(learnerBeforeWhy.safety.profileMutated === false, 'learner json profile mutation safety flag invalid');
  assert(learnerBeforeWhy.safety.unsafeJudgmentIncluded === false, 'learner json unsafe judgment safety flag invalid');
  const learnerBadFlag = runExpectFail(['learner', '--bad']);
  assert(learnerBadFlag.includes('Usage: contextbook learner [--json]'), 'learner unknown flag missing usage guidance');

  const memoryMissingType = runExpectFail(['memory', 'add-signal']);
  assert(memoryMissingType.includes('Allowed types:'), 'memory add-signal missing type did not show allowed types');
  const memoryBadType = runExpectFail(['memory', 'add-signal', '--type', 'user.is.beginner']);
  assert(memoryBadType.includes('feedback.confused'), 'memory add-signal unknown type did not show allowed types');
  const memorySignalsBefore = JSON.parse(run(['memory', 'signals', '--json']));
  assert(memorySignalsBefore.schemaVersion === 1, 'memory signals json missing schema version');
  assert(memorySignalsBefore.safety.profileMutated === false && memorySignalsBefore.safety.weakTermsMutated === false, 'memory signals safety flags invalid');
  const weakSuggestionsBefore = JSON.parse(run(['memory', 'suggest-weak-terms', '--json']));
  assert(weakSuggestionsBefore.schemaVersion === 1, 'weak suggestions json missing schema version');
  assert(Array.isArray(weakSuggestionsBefore.candidates) && weakSuggestionsBefore.candidates.length === 0, 'weak suggestions before signals should be empty');
  assert(weakSuggestionsBefore.safety.profileMutated === false && weakSuggestionsBefore.safety.weakTermsMutated === false, 'weak suggestions safety flags invalid');
  const profileCandidatesBefore = JSON.parse(run(['memory', 'suggest-profile-updates', '--json']));
  assert(profileCandidatesBefore.schemaVersion === 1, 'profile candidates json missing schema version');
  assert(Array.isArray(profileCandidatesBefore.candidates) && profileCandidatesBefore.candidates.length === 0, 'profile candidates before signals should be empty');
  assert(profileCandidatesBefore.safety.profileMutated === false && profileCandidatesBefore.safety.preferencesMutated === false, 'profile candidates safety flags invalid');
  const memoryContextBefore = JSON.parse(run(['memory', 'context', '--json']));
  for (const key of ['schemaVersion', 'generatedAt', 'project', 'learnerMemory', 'conversation', 'suggestions', 'freshness', 'recommendedActions', 'safety']) {
    assert(Object.prototype.hasOwnProperty.call(memoryContextBefore, key), `memory context before init missing ${key}`);
  }
  assert(memoryContextBefore.schemaVersion === 1, 'memory context before init missing schema version');
  assert(memoryContextBefore.freshness.staleHints.some((hint) => hint.code === 'project-not-initialized'), 'memory context before init missing project-not-initialized hint');
  assert(memoryContextBefore.freshness.staleHints.some((hint) => hint.code === 'project-not-scanned'), 'memory context before init missing project-not-scanned hint');
  assert(memoryContextBefore.recommendedActions.some((action) => action.command === 'contextbook init' && action.source === 'freshness'), 'memory context before init missing init action');
  assert(memoryContextBefore.safety.rawTranscriptIncluded === false && memoryContextBefore.safety.profileMutated === false && memoryContextBefore.safety.projectMemoryMutated === false, 'memory context before init safety flags invalid');
  assert(memoryContextBefore.project.safety.persistedSummaryCreated === false, 'memory context project safety flag invalid');
  const memoryContextBadFlag = runExpectFail(['memory', 'context', '--bad']);
  assert(memoryContextBadFlag.includes('Usage: contextbook memory context [--json]'), 'memory context unknown flag missing usage guidance');
  assert(!existsSync(join(root, '.contextbook')), 'memory context should not create project memory before init');


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
  const coreProjectJson = core.toProjectSummaryJson(coreProject);
  assert(coreProjectJson.schemaVersion === 1, 'core project json missing schema version');
  assert(Array.isArray(coreProjectJson.topConcepts) && coreProjectJson.topConcepts.length >= 1, 'core project json missing top concepts');
  assert(coreProjectJson.fileIndexSummary.totals.scanned === fileIndex.totals.scanned, 'core project json file index summary mismatch');
  assert(coreProjectJson.safety.absolutePathsIncluded === false && coreProjectJson.safety.hiddenContentIncluded === false, 'core project json safety flags invalid');
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
  const projectJson = JSON.parse(run(['project', '--json']));
  for (const key of ['schemaVersion', 'generatedAt', 'memoryFiles', 'topConcepts', 'recentScanRuns', 'fileIndexSummary', 'evidenceCount', 'recommendedActions', 'safety']) {
    assert(Object.prototype.hasOwnProperty.call(projectJson, key), `project json missing ${key}`);
  }
  assert(projectJson.schemaVersion === 1, 'project json schema version invalid');
  assert(Array.isArray(projectJson.topConcepts) && projectJson.topConcepts.some((concept) => concept.label.includes('SSE') || concept.label.includes('useEffect') || concept.label.includes('Zustand')), 'project json missing expected concepts');
  assert(projectJson.recommendedActions.some((action) => action.command === 'contextbook learn'), 'project json missing learn action');
  assert(projectJson.recommendedActions.some((action) => action.command === 'contextbook why "<concept>"'), 'project json missing why action');
  assert(projectJson.safety.absolutePathsIncluded === false, 'project json absolute path safety flag invalid');
  assert(projectJson.safety.hiddenContentIncluded === false, 'project json hidden content safety flag invalid');
  assert(projectJson.safety.profileMutated === false, 'project json profile mutation safety flag invalid');
  assert(projectJson.safety.persistedSummaryCreated === false, 'project json summary artifact safety flag invalid');
  const projectJsonSerialized = JSON.stringify(projectJson);
  assert(!projectJsonSerialized.includes(root) && !projectJsonSerialized.includes(home), 'project json included absolute local path');
  assert(!projectJsonSerialized.includes('SECRET_TOKEN') && !projectJsonSerialized.includes('should-not-leak'), 'project json included hidden file content');
  assert(!projectJsonSerialized.includes('EventSource should be ignored'), 'project json included hidden runtime content');
  assert(!existsSync(join(root, '.contextbook', 'project', 'summary.json')), 'project --json created a persisted summary artifact');

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

  const learnerOutput = run(['learner']);
  assert(learnerOutput.includes('# Learner Memory'), 'learner markdown missing heading');
  assert(learnerOutput.includes('## Top Weak Terms'), 'learner markdown missing weak terms');
  assert(learnerOutput.includes('원문 전체 대화 저장 없음'), 'learner markdown missing safety boundary');
  const learnerJson = JSON.parse(run(['learner', '--json']));
  assert(learnerJson.schemaVersion === 1, 'learner json after why missing schema version');
  assert(learnerJson.topWeakTerms.some((item) => item.term.includes('cleanup')), 'learner json missing cleanup weak term');
  assert(learnerJson.recentSignals.some((item) => item.signalType === 'why.answered'), 'learner json missing recent why signal');
  assert(learnerJson.recommendedActions.some((item) => item.command.includes('contextbook why')), 'learner json missing why recommended action');
  assert(learnerJson.safety.absolutePathsIncluded === false, 'learner json absolute path safety flag invalid');
  assert(!JSON.stringify(learnerJson).includes(root) && !JSON.stringify(learnerJson).includes(home), 'learner json leaked absolute local path');
  assert(!/beginner|low ability|이해력이 낮/.test(JSON.stringify(learnerJson)), 'learner json includes unsafe learner judgment');

  const captureSignalsBefore = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const captureProfileBefore = await readFile(join(learnerDir, 'profile.md'), 'utf8');
  const capturePreferencesBefore = await readFile(join(learnerDir, 'preferences.json'), 'utf8');
  const captureWeakTermsBefore = await readFile(join(learnerDir, 'weak-terms.json'), 'utf8');
  const captureProjectEvidenceBefore = await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8');
  const noMatchCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '오늘 다음 작업 진행해줘', '--source', 'manual', '--json']));
  assert(noMatchCapture.schemaVersion === 1 && noMatchCapture.capturedSignals.length === 0, 'capture no-match should not capture signals');
  assert(Array.isArray(noMatchCapture.preferenceSignals) && noMatchCapture.preferenceSignals.length === 0, 'capture no-match should not classify preferences');
  assert(noMatchCapture.preferenceSignalCounts.autoApplySafe === 0 && noMatchCapture.preferenceSignalCounts.ignored === 0, 'capture no-match preference counts invalid');
  assert(noMatchCapture.skippedReasons.includes('no-explicit-learning-signal'), 'capture no-match missing skip reason');
  assert(await readFile(join(learnerDir, 'signals.jsonl'), 'utf8') === captureSignalsBefore, 'capture no-match appended signals');
  const confusedCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '뭔소리야 너무 추상적임', '--source', 'manual', '--json']));
  assert(confusedCapture.source === 'manual' && confusedCapture.capturedSignals.some((item) => item.signalType === 'feedback.confused' && item.command === 'memory.capture-prompt'), 'capture confused signal missing');
  assert(confusedCapture.preferenceSignals.some((item) => item.dimension === 'avoid' && item.value === 'abstract-lecture-first' && item.route === 'auto-apply-safe'), 'capture confused missing avoid preference signal');
  assert(confusedCapture.safety.rawTranscriptIncluded === false && confusedCapture.safety.rawPromptPersisted === false && confusedCapture.safety.profileMutated === false, 'capture confused safety invalid');
  const formatCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '내 프로젝트에 빗대서 설명해줘', '--source', 'codex', '--json']));
  assert(formatCapture.source === 'codex' && formatCapture.capturedSignals.some((item) => item.signalType === 'format.requested' && item.metadata?.format === 'project-first'), 'capture project-first format signal missing');
  assert(formatCapture.preferenceSignals.some((item) => item.dimension === 'explanation.order' && item.value === 'project-first' && item.source === 'codex'), 'capture project-first preference signal missing');
  const positiveCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '좋다 이해됐어', '--source=claude-code', '--json']));
  assert(positiveCapture.source === 'claude-code' && positiveCapture.capturedSignals.some((item) => item.signalType === 'feedback.positive'), 'capture positive signal missing');
  const captureMarkdown = run(['memory', 'capture-prompt', '--prompt', '비유 별로', '--source', 'manual']);
  assert(captureMarkdown.includes('# Prompt Signal Capture') && captureMarkdown.includes('analogy.rejected') && captureMarkdown.includes('## Preference Signals'), 'capture markdown missing rejected analogy/preference section');
  const mixedPrompt = '너무 추상적이야. 앞으로 내 프로젝트 코드 기준으로 쉽게 설명하고, 면접 문장은 짧게 줘. 명령어는 너무 많이 주지 마.';
  const mixedCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', mixedPrompt, '--source', 'manual', '--json']));
  const mixedPreferenceKeys = new Set(mixedCapture.preferenceSignals.map((item) => `${item.dimension}=${item.value}`));
  for (const key of ['avoid=abstract-lecture-first', 'explanation.order=project-first', 'explanation.style=plain-language', 'output.section=interview-sentence', 'output.length=short', 'command.volume=fewer-commands']) {
    assert(mixedPreferenceKeys.has(key), `mixed capture missing preference ${key}`);
  }
  assert(mixedCapture.preferenceSignals.length >= 5, 'mixed capture should classify multiple preference signals');
  assert(mixedCapture.preferenceSignals.filter((item) => item.route === 'auto-apply-safe').length >= 5, 'mixed capture safe preferences should be auto-apply eligible labels');
  assert(mixedCapture.safety.preferencesMutated === false && mixedCapture.safety.profileMutated === false, 'mixed capture mutated profile/preferences');
  const koreanCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '앞으로 한국어로 설명해줘. 영어보다 한국어가 좋아.', '--source', 'manual', '--json']));
  assert(koreanCapture.preferenceSignals.some((item) => item.dimension === 'language' && item.value === 'ko' && item.route === 'auto-apply-safe'), 'language capture missing ko preference');
  const selfJudgmentCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '나는 CS를 못해서 그런가 이해가 잘 안 돼.', '--source', 'manual', '--json']));
  assert(selfJudgmentCapture.preferenceSignals.some((item) => item.dimension === 'self-assessment'), 'self judgment capture missing self-assessment signal');
  assert(!selfJudgmentCapture.preferenceSignals.some((item) => item.dimension === 'self-assessment' && item.route === 'auto-apply-safe'), 'self judgment must not be auto-apply safe');
  assert(selfJudgmentCapture.safety.unsafeJudgmentIncluded === false, 'self judgment safety flag should remain false');
  const capturedSignalsAfter = await readJsonl(join(learnerDir, 'signals.jsonl'));
  assert(capturedSignalsAfter.some((item) => item.command === 'memory.capture-prompt' && item.signalType === 'feedback.confused'), 'signals missing captured confusion event');
  assert(capturedSignalsAfter.some((item) => item.command === 'memory.capture-prompt' && item.signalType === 'format.requested'), 'signals missing captured format event');
  const capturedSignalsSerialized = JSON.stringify(capturedSignalsAfter.filter((item) => item.command === 'memory.capture-prompt'));
  assert(!capturedSignalsSerialized.includes('뭔소리야 너무 추상적임') && !capturedSignalsSerialized.includes('내 프로젝트에 빗대서 설명해줘') && !capturedSignalsSerialized.includes(mixedPrompt), 'capture persisted raw prompt text');
  assert(await readFile(join(learnerDir, 'profile.md'), 'utf8') === captureProfileBefore, 'capture mutated profile.md');
  assert(await readFile(join(learnerDir, 'preferences.json'), 'utf8') === capturePreferencesBefore, 'capture mutated preferences.json');
  assert(await readFile(join(learnerDir, 'weak-terms.json'), 'utf8') === captureWeakTermsBefore, 'capture mutated weak terms');
  assert(await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8') === captureProjectEvidenceBefore, 'capture mutated project evidence');
  const coreCaptureCandidates = core.classifyPromptSignals('비유 좋다');
  assert(coreCaptureCandidates.some((item) => item.signalType === 'analogy.accepted'), 'core capture classifier missing accepted analogy');
  const corePreferenceCandidates = core.classifyPreferenceSignals('한국어로 쉽게 설명해줘');
  assert(corePreferenceCandidates.some((item) => item.dimension === 'language' && item.value === 'ko'), 'core preference classifier missing language signal');

  const applyPreferencePrompt = '앞으로 한국어로, 내 프로젝트 기준으로 쉽게 설명하고, 면접 문장은 짧게 줘. 명령어는 너무 많이 주지 마.';
  const preferenceApplyProfileBefore = await readFile(join(learnerDir, 'profile.md'), 'utf8');
  const preferenceApplyWeakBefore = await readFile(join(learnerDir, 'weak-terms.json'), 'utf8');
  const preferenceApplyProjectBefore = await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8');
  const preferenceApplyPreferencesBefore = await readFile(join(learnerDir, 'preferences.json'), 'utf8');
  const preferenceApplyAuditBefore = await readFile(join(learnerDir, 'profile-updates.jsonl'), 'utf8');
  const preferenceApplySignalsBefore = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const preferenceApplyBackupsBefore = (await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-'));
  const dryPreferenceApply = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', applyPreferencePrompt, '--source', 'manual', '--dry-run', '--json']));
  assert(dryPreferenceApply.schemaVersion === 1 && dryPreferenceApply.dryRun === true && dryPreferenceApply.applied === false, 'preference apply dry-run shape invalid');
  assert(dryPreferenceApply.preferenceSignals.some((item) => item.dimension === 'language' && item.value === 'ko'), 'preference apply dry-run missing language signal');
  assert(dryPreferenceApply.changes.some((change) => change.operation === 'set-language'), 'preference apply dry-run missing language change');
  assert(dryPreferenceApply.safety.preferencesMutated === false && dryPreferenceApply.safety.rawPromptPersisted === false, 'preference apply dry-run safety invalid');
  assert(await readFile(join(learnerDir, 'preferences.json'), 'utf8') === preferenceApplyPreferencesBefore, 'preference apply dry-run mutated preferences');
  assert(await readFile(join(learnerDir, 'profile-updates.jsonl'), 'utf8') === preferenceApplyAuditBefore, 'preference apply dry-run appended audit');
  assert((await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length === preferenceApplyBackupsBefore.length, 'preference apply dry-run created backup');
  const realPreferenceApply = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', applyPreferencePrompt, '--source=codex', '--json']));
  assert(realPreferenceApply.source === 'codex' && realPreferenceApply.applied === true && realPreferenceApply.dryRun === false, 'preference apply real apply did not apply');
  assert(realPreferenceApply.auditEvent?.signalType === 'profile-update.applied' && realPreferenceApply.auditEvent?.command === 'memory.apply-preference-signals', 'preference apply missing typed audit event');
  assert(realPreferenceApply.backupCreated?.startsWith('preferences.json.bak-'), 'preference apply missing backup basename');
  const preferencesAfterPreferenceApply = await readJson(join(learnerDir, 'preferences.json'));
  assert(preferencesAfterPreferenceApply.preferredLanguage === 'ko', 'preference apply did not set preferred language');
  assert(preferencesAfterPreferenceApply.outputLength === 'short', 'preference apply did not set short output length');
  assert(preferencesAfterPreferenceApply.explanationOrder[0] === 'project', 'preference apply did not move project first');
  assert(preferencesAfterPreferenceApply.explanationOrder.includes('plain') && preferencesAfterPreferenceApply.explanationOrder.includes('interview-sentence'), 'preference apply missing explanation order entries');
  assert(preferencesAfterPreferenceApply.avoid.includes('too many commands'), 'preference apply did not set fewer commands avoid rule');
  assert(await readFile(join(learnerDir, 'profile.md'), 'utf8') === preferenceApplyProfileBefore, 'preference apply mutated profile.md');
  assert(await readFile(join(learnerDir, 'weak-terms.json'), 'utf8') === preferenceApplyWeakBefore, 'preference apply mutated weak terms');
  assert(await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8') === preferenceApplyProjectBefore, 'preference apply mutated project memory');
  assert(await readFile(join(learnerDir, 'signals.jsonl'), 'utf8') === preferenceApplySignalsBefore, 'preference apply should not append to signals.jsonl');
  const preferenceApplyAuditsAfter = await readJsonl(join(learnerDir, 'profile-updates.jsonl'));
  const preferenceApplyAuditEvents = preferenceApplyAuditsAfter.filter((item) => item.command === 'memory.apply-preference-signals');
  assert(preferenceApplyAuditEvents.length === 1, 'preference apply should append exactly one audit event');
  assert(!JSON.stringify(preferenceApplyAuditEvents).includes(applyPreferencePrompt), 'preference apply audit persisted raw prompt');
  assert((await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length === preferenceApplyBackupsBefore.length + 1, 'preference apply did not create exactly one backup');
  const reapplyPreference = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', applyPreferencePrompt, '--source', 'manual', '--json']));
  assert(reapplyPreference.applied === false && reapplyPreference.changes.every((change) => change.operation === 'skip-identical'), 'preference reapply should skip identical changes');
  assert((await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length === preferenceApplyBackupsBefore.length + 1, 'preference reapply created extra backup');
  assert((await readJsonl(join(learnerDir, 'profile-updates.jsonl'))).length === preferenceApplyAuditsAfter.length, 'preference reapply appended extra audit');
  const selfAssessmentPreference = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', '나는 CS를 못해서 그런가 이해가 잘 안 돼. 앞으로 쉽게 설명해줘.', '--dry-run', '--json']));
  assert(selfAssessmentPreference.preferenceSignals.some((item) => item.dimension === 'self-assessment'), 'preference apply self-assessment missing signal');
  assert(selfAssessmentPreference.changes.some((change) => change.signal?.dimension === 'self-assessment' && change.operation === 'skip-unsafe-route'), 'preference apply self-assessment was not skipped');
  const taskOnlyPreference = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', 'PR 머지하고 다음 작업 진행해줘.', '--json']));
  assert(taskOnlyPreference.applied === false && taskOnlyPreference.preferenceSignals.length === 0 && taskOnlyPreference.changes.length === 0, 'task-only preference apply should no-op');
  const claudePreference = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', '영어로 간결하게 설명해줘.', '--source', 'claude-code', '--dry-run', '--json']));
  assert(claudePreference.source === 'claude-code' && claudePreference.preferenceSignals.some((item) => item.dimension === 'language' && item.value === 'en'), 'preference apply did not accept claude-code source');
  const badPreferenceSource = runExpectFail(['memory', 'apply-preference-signals', '--prompt', '한국어로 설명해줘', '--source', 'bad']);
  assert(badPreferenceSource.includes('Usage: contextbook memory apply-preference-signals'), 'preference apply invalid source missing usage');
  const preferenceApplyMarkdown = run(['memory', 'apply-preference-signals', '--prompt', '한국어로 쉽게 설명해줘', '--dry-run']);
  assert(preferenceApplyMarkdown.includes('# Apply Preference Signals') && preferenceApplyMarkdown.includes('## Preference Signals') && preferenceApplyMarkdown.includes('## Changes') && preferenceApplyMarkdown.includes('## Safety'), 'preference apply markdown missing sections');
  await writeFile(join(learnerDir, 'preferences.json'), preferenceApplyPreferencesBefore, 'utf8');

  const weakTermsBeforeSignal = await readJson(join(learnerDir, 'weak-terms.json'));
  run(['memory', 'add-signal', '--type', 'feedback.confused', '--concept', 'event loop', '--note', 'too abstract '.repeat(40)]);
  run(['memory', 'add-signal', '--type', 'term.repeated', '--concept', 'Event Loop']);
  const profileBeforeSignal = await readFile(join(learnerDir, 'profile.md'), 'utf8');
  const preferencesBeforeSignal = await readFile(join(learnerDir, 'preferences.json'), 'utf8');
  run(['memory', 'add-signal', '--type', 'format.requested', '--concept', 'cleanup', '--format', 'project-first']);
  run(['memory', 'add-signal', '--type', 'feedback.confused', '--concept', 'event loop', '--note', 'too abstract']);
  run(['memory', 'add-signal', '--type', 'analogy.accepted', '--concept', 'cleanup', '--note', 'resource lifecycle works']);
  const memorySignals = run(['memory', 'signals']);
  assert(memorySignals.includes('# Memory Signals') && memorySignals.includes('feedback.confused'), 'memory signals markdown missing added signal');
  const memorySignalsJson = JSON.parse(run(['memory', 'signals', '--json']));
  assert(memorySignalsJson.recentSignals.some((item) => item.signalType === 'feedback.confused' && item.conceptLabel === 'event loop'), 'memory signals json missing feedback signal');
  assert(memorySignalsJson.recentSignals.some((item) => item.signalType === 'term.repeated' && item.conceptLabel === 'Event Loop'), 'memory signals json missing repeated-term signal');
  assert(memorySignalsJson.recentSignals.some((item) => item.signalType === 'format.requested' && item.conceptLabel === 'cleanup'), 'memory signals json missing format signal');
  const confused = memorySignalsJson.recentSignals.find((item) => item.signalType === 'feedback.confused');
  assert(confused.metadata.note.length <= 160, 'memory signal note was not truncated');
  assert(memorySignalsJson.safety.rawTranscriptIncluded === false && memorySignalsJson.safety.unsafeJudgmentIncluded === false, 'memory signals json safety flags invalid');
  const weakSuggestions = JSON.parse(run(['memory', 'suggest-weak-terms', '--json']));
  assert(weakSuggestions.candidates.some((item) => item.term.toLowerCase() === 'event loop' && item.score >= 6), 'weak suggestions missing event loop candidate');
  const eventLoopSuggestion = weakSuggestions.candidates.find((item) => item.term.toLowerCase() === 'event loop');
  assert(eventLoopSuggestion.reasons.some((reason) => reason.code === 'confused-feedback'), 'weak suggestion missing confused reason');
  assert(eventLoopSuggestion.reasons.some((reason) => reason.code === 'repeated-term'), 'weak suggestion missing repeated-term reason');
  assert(eventLoopSuggestion.recommendedActions.some((action) => action.command.includes('contextbook why')), 'weak suggestion missing why recommendation');
  assert(weakSuggestions.safety.rawTranscriptIncluded === false && weakSuggestions.safety.weakTermsMutated === false, 'weak suggestions safety flags invalid after signal');
  const weakSuggestionsMarkdown = run(['memory', 'suggest-weak-terms']);
  assert(weakSuggestionsMarkdown.includes('# Weak-term Suggestions') && weakSuggestionsMarkdown.includes('event loop'), 'weak suggestions markdown missing event loop');
  const profileCandidates = JSON.parse(run(['memory', 'suggest-profile-updates', '--json']));
  assert(profileCandidates.candidates.every((item) => typeof item.id === 'string' && item.id.startsWith('profile-update:')), 'profile candidates missing deterministic ids');
  const profileCandidatesAgain = JSON.parse(run(['memory', 'suggest-profile-updates', '--json']));
  assert(JSON.stringify(profileCandidates.candidates.map((item) => item.id)) === JSON.stringify(profileCandidatesAgain.candidates.map((item) => item.id)), 'profile candidate ids should be stable across reads');
  assert(profileCandidates.candidates.some((item) => item.targetSection === 'Preferred Explanation' && item.reasons.some((reason) => reason.code === 'project-first-requested')), 'profile candidates missing project-first suggestion');
  assert(profileCandidates.candidates.some((item) => item.targetSection === 'Avoid' && item.reasons.some((reason) => reason.code === 'abstract-confusion')), 'profile candidates missing avoid abstract suggestion');
  assert(profileCandidates.safety.profileMutated === false && profileCandidates.safety.preferencesMutated === false && profileCandidates.safety.profileUpdatesMutated === false, 'profile candidates safety flags invalid after signal');
  const profileCandidatesMarkdown = run(['memory', 'suggest-profile-updates']);
  assert(profileCandidatesMarkdown.includes('# Profile Update Candidates') && profileCandidatesMarkdown.includes('project context') && profileCandidatesMarkdown.includes('profile-update:'), 'profile candidates markdown missing project context suggestion/id');
  const learnerAfterSignal = JSON.parse(run(['learner', '--json']));
  assert(learnerAfterSignal.recentSignals.some((item) => item.signalType === 'feedback.confused'), 'learner json did not reflect added memory signal');
  assert(learnerAfterSignal.weakTermSuggestions.some((item) => item.term.toLowerCase() === 'event loop'), 'learner json missing weak term suggestion');
  assert(learnerAfterSignal.profileUpdateCandidates.some((item) => item.targetSection === 'Preferred Explanation'), 'learner json missing profile update candidate');
  const coreSignals = await readJsonl(join(learnerDir, 'signals.jsonl'));
  const coreSuggestions = core.buildWeakTermSuggestions(coreSignals, weakTermsBeforeSignal);
  assert(coreSuggestions.some((item) => item.term.toLowerCase() === 'event loop'), 'core weak suggestion contract missing event loop');
  const coreProfileCandidates = core.buildProfileUpdateCandidates(coreSignals, { explanationOrder: learnerAfterSignal.preferences.explanationOrder, avoid: learnerAfterSignal.preferences.avoid, profileSections: learnerAfterSignal.profileSections });
  assert(coreProfileCandidates.some((item) => item.targetSection === 'Preferred Explanation'), 'core profile candidate contract missing preferred explanation');
  const weakTermsAfterSignal = await readJson(join(learnerDir, 'weak-terms.json'));
  assert(JSON.stringify(weakTermsAfterSignal) === JSON.stringify(weakTermsBeforeSignal), 'memory add-signal/suggest mutated weak terms');
  assert(await readFile(join(learnerDir, 'profile.md'), 'utf8') === profileBeforeSignal, 'profile suggestion mutated profile.md');
  assert(await readFile(join(learnerDir, 'preferences.json'), 'utf8') === preferencesBeforeSignal, 'profile suggestion mutated preferences.json');

  const projectFirstProfileCandidate = profileCandidates.candidates.find((item) => item.targetSection === 'Preferred Explanation' && item.reasons.some((reason) => reason.code === 'project-first-requested'));
  assert(projectFirstProfileCandidate, 'missing project-first candidate for apply test');
  const profileUpdatesBeforeApply = await readFile(join(learnerDir, 'profile-updates.jsonl'), 'utf8');
  const signalsBeforeApply = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const backupEntriesBeforeApply = (await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-'));
  const dryRunApply = JSON.parse(run(['memory', 'apply-profile-update', '--candidate', projectFirstProfileCandidate.id, '--dry-run', '--json']));
  assert(dryRunApply.schemaVersion === 1 && dryRunApply.dryRun === true && dryRunApply.applied === false, 'profile apply dry-run shape invalid');
  assert(dryRunApply.changes.some((change) => change.file === 'preferences.json'), 'profile apply dry-run missing preferences change plan');
  assert(await readFile(join(learnerDir, 'preferences.json'), 'utf8') === preferencesBeforeSignal, 'profile apply dry-run mutated preferences');
  assert(await readFile(join(learnerDir, 'profile-updates.jsonl'), 'utf8') === profileUpdatesBeforeApply, 'profile apply dry-run appended profile update audit');
  assert(await readFile(join(learnerDir, 'signals.jsonl'), 'utf8') === signalsBeforeApply, 'profile apply dry-run appended signal audit');
  assert(JSON.stringify(await readJson(join(learnerDir, 'weak-terms.json'))) === JSON.stringify(weakTermsBeforeSignal), 'profile apply dry-run mutated weak terms');
  assert((await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length === backupEntriesBeforeApply.length, 'profile apply dry-run created backup');
  const realApply = JSON.parse(run(['memory', 'apply-profile-update', '--candidate', projectFirstProfileCandidate.id, '--json']));
  assert(realApply.dryRun === false && realApply.applied === true, 'profile apply real apply did not apply supported candidate');
  assert(realApply.auditEvent?.signalType === 'profile-update.applied' && realApply.auditEvent?.command === 'memory.apply-profile-update', 'profile apply missing typed audit event');
  const preferencesAfterApply = await readJson(join(learnerDir, 'preferences.json'));
  assert(preferencesAfterApply.explanationOrder[0] === 'project', 'profile apply did not move project first');
  assert(await readFile(join(learnerDir, 'profile.md'), 'utf8') === profileBeforeSignal, 'profile apply mutated profile.md');
  assert(JSON.stringify(await readJson(join(learnerDir, 'weak-terms.json'))) === JSON.stringify(weakTermsBeforeSignal), 'profile apply mutated weak terms');
  const profileUpdatesAfterApply = await readJsonl(join(learnerDir, 'profile-updates.jsonl'));
  assert(profileUpdatesAfterApply.some((item) => item.signalType === 'profile-update.applied' && item.command === 'memory.apply-profile-update'), 'profile apply audit missing from profile-updates');
  assert(await readFile(join(learnerDir, 'signals.jsonl'), 'utf8') === signalsBeforeApply, 'profile apply should not append to signals.jsonl');
  assert((await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length === backupEntriesBeforeApply.length + 1, 'profile apply did not create exactly one backup');
  const reapply = JSON.parse(run(['memory', 'apply-profile-update', '--candidate', projectFirstProfileCandidate.id, '--json']));
  assert(reapply.applied === false && reapply.changes.some((change) => change.operation === 'skip-identical'), 'profile reapply should skip identical');
  assert((await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length === backupEntriesBeforeApply.length + 1, 'profile reapply created extra backup');
  assert((await readJsonl(join(learnerDir, 'profile-updates.jsonl'))).length === profileUpdatesAfterApply.length, 'profile reapply appended extra audit');
  const analogyCandidate = profileCandidates.candidates.find((item) => item.targetSection === 'Analogy Notes');
  assert(analogyCandidate, 'missing analogy candidate for unsupported apply test');
  const updatesBeforeUnsupported = await readFile(join(learnerDir, 'profile-updates.jsonl'), 'utf8');
  const unsupportedApply = JSON.parse(run(['memory', 'apply-profile-update', '--candidate', analogyCandidate.id, '--json']));
  assert(unsupportedApply.applied === false && unsupportedApply.changes.some((change) => change.operation === 'unsupported-target' && change.message.includes('contextbook profile edit')), 'unsupported apply did not no-op with profile edit guidance');
  assert(await readFile(join(learnerDir, 'profile-updates.jsonl'), 'utf8') === updatesBeforeUnsupported, 'unsupported apply appended audit');
  const applyMarkdown = run(['memory', 'apply-profile-update', '--candidate', projectFirstProfileCandidate.id, '--dry-run']);
  assert(applyMarkdown.includes('# Apply Profile Update') && applyMarkdown.includes('## Safety'), 'profile apply markdown missing sections');

  const memoryContext = JSON.parse(run(['memory', 'context', '--json']));
  for (const key of ['schemaVersion', 'project', 'learnerMemory', 'conversation', 'suggestions', 'freshness', 'recommendedActions', 'safety']) {
    assert(Object.prototype.hasOwnProperty.call(memoryContext, key), `memory context missing ${key}`);
  }
  assert(memoryContext.project.topConcepts.some((concept) => concept.label.includes('SSE') || concept.label.includes('useEffect') || concept.label.includes('Zustand')), 'memory context missing top project concepts');
  assert(memoryContext.learnerMemory.weakTermSuggestions.some((item) => item.term.toLowerCase() === 'event loop'), 'memory context learnerMemory missing weak-term suggestion');
  assert(memoryContext.suggestions.weakTerms.candidates.some((item) => item.term.toLowerCase() === 'event loop'), 'memory context suggestions missing weak-term candidate');
  assert(memoryContext.suggestions.profileUpdates.candidates.some((item) => item.targetSection === 'Preferred Explanation'), 'memory context suggestions missing profile update candidate');
  assert(memoryContext.freshness.projectScannedAt === scanRunsAfterSecondScan[1].scannedAt, 'memory context freshness should use latest scan timestamp');
  assert(memoryContext.recommendedActions.every((action) => action.source), 'memory context recommended actions missing source');
  assert(memoryContext.recommendedActions.some((action) => action.command.includes('memory apply-profile-update') && action.command.includes('--dry-run')), 'memory context missing profile apply dry-run recommendation');
  assert(new Set(memoryContext.recommendedActions.map((action) => action.command)).size === memoryContext.recommendedActions.length, 'memory context recommended actions should be deduped by command');
  assert(memoryContext.safety.rawTranscriptIncluded === false && memoryContext.safety.hiddenContentIncluded === false && memoryContext.safety.projectMemoryMutated === false && memoryContext.safety.profileUpdatesMutated === false, 'memory context safety flags invalid after signals');
  const memoryContextSerialized = JSON.stringify(memoryContext);
  assert(!memoryContextSerialized.includes(root) && !memoryContextSerialized.includes(home), 'memory context leaked absolute local path');
  assert(!memoryContextSerialized.includes('SECRET_TOKEN') && !memoryContextSerialized.includes('should-not-leak'), 'memory context included hidden file content');
  assert(!memoryContextSerialized.includes('EventSource should be ignored'), 'memory context included hidden runtime content');
  const memoryContextMarkdown = run(['memory', 'context']);
  assert(memoryContextMarkdown.includes('# Contextbook Memory Context') && memoryContextMarkdown.includes('## Next Actions'), 'memory context markdown missing summary sections');
  const coreMemoryContext = await core.buildMemoryContext({ root, learner: 'default' });
  assert(coreMemoryContext.schemaVersion === 1 && coreMemoryContext.recommendedActions.length >= 1, 'core memory context contract invalid');


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
  assert(profileUpdates.some((item) => item.signalType === 'profile-update.applied'), 'profile-updates missing profile apply audit');
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
  const codexHookScript = join(home, '.codex', 'hooks', 'contextbook-user-prompt-submit.js');
  const codexHookGuide = join(home, '.codex', 'hooks', 'contextbook-user-prompt-submit.md');
  const claudeHookScript = join(home, '.claude', 'hooks', 'contextbook-user-prompt-submit.js');
  const claudeHookGuide = join(home, '.claude', 'hooks', 'contextbook-user-prompt-submit.md');

  const hooksStatusBefore = run(['hooks', 'status']);
  assert(hooksStatusBefore.includes('# Contextbook Hooks Status'), 'hooks status missing heading');
  assert(hooksStatusBefore.includes('helper script: missing'), 'hooks status before setup should show missing helpers');
  assert(hooksStatusBefore.includes('contextbook setup --hooks'), 'hooks status before setup missing setup action');
  const hooksStatusJsonBefore = JSON.parse(run(['hooks', 'status', '--json']));
  assert(hooksStatusJsonBefore.schemaVersion === 1, 'hooks status json missing schema version');
  assert(hooksStatusJsonBefore.safety.readOnly === true && hooksStatusJsonBefore.safety.configMutated === false, 'hooks status safety flags invalid');
  assert(hooksStatusJsonBefore.platforms.length === 2, 'hooks status json should include both platforms');

  const setupDryRun = run(['setup', '--dry-run']);
  assert(setupDryRun.includes('# Contextbook setup (dry run)'), 'setup dry-run did not show setup heading');
  assert(setupDryRun.includes('# Contextbook codex install (dry run)') && setupDryRun.includes('# Contextbook claude-code install (dry run)'), 'setup dry-run did not preview both adapters');
  assert(setupDryRun.includes('.codex') && setupDryRun.includes('.claude'), 'setup dry-run did not show codex and claude target paths');
  assert(!existsSync(codexSkill) && !existsSync(claudeSkill), 'setup dry-run wrote files');
  assert(!existsSync(codexHookScript) && !existsSync(claudeHookScript), 'setup dry-run wrote hook files');

  const setupHooksDryRun = run(['setup', '--hooks', '--dry-run']);
  assert(setupHooksDryRun.includes('.codex') && setupHooksDryRun.includes('.claude'), 'setup hooks dry-run did not show platform paths');
  assert(setupHooksDryRun.includes('.codex/hooks') && setupHooksDryRun.includes('.claude/hooks'), 'setup hooks dry-run did not preview hook paths');
  assert(setupHooksDryRun.includes('UserPromptSubmit'), 'setup hooks dry-run did not describe prompt hooks');
  assert(!existsSync(codexHookScript) && !existsSync(claudeHookScript), 'setup hooks dry-run wrote hook files');

  const allDryRun = run(['install', 'all', '--dry-run']);
  assert(allDryRun.includes('# Contextbook codex install (dry run)') && allDryRun.includes('# Contextbook claude-code install (dry run)'), 'install all dry-run did not preview both adapters');
  assert(allDryRun.includes('.codex') && allDryRun.includes('.claude'), 'install all dry-run did not show codex and claude target paths');
  assert(!existsSync(codexSkill) && !existsSync(claudeSkill), 'install all dry-run wrote files');

  const codexHooksDryRun = run(['install', 'codex', '--hooks', '--dry-run']);
  assert(codexHooksDryRun.includes('.codex/hooks') && codexHooksDryRun.includes('UserPromptSubmit'), 'codex hooks dry-run did not preview hook files');
  assert(!existsSync(codexHookScript) && !existsSync(codexHookGuide), 'codex hooks dry-run wrote hook files');
  const claudeHooksDryRun = run(['install', 'claude-code', '--hooks', '--dry-run']);
  assert(claudeHooksDryRun.includes('.claude/hooks') && claudeHooksDryRun.includes('UserPromptSubmit'), 'claude hooks dry-run did not preview hook files');
  assert(!existsSync(claudeHookScript) && !existsSync(claudeHookGuide), 'claude hooks dry-run wrote hook files');

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
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook project --json'), 'setup codex skill missing project json guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook learner --json'), 'setup codex skill missing learner json guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory context --json'), 'setup codex skill missing memory context guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory add-signal'), 'setup codex skill missing memory signal guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory capture-prompt'), 'setup codex skill missing prompt capture guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory suggest-weak-terms --json'), 'setup codex skill missing weak suggestion guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory suggest-profile-updates --json'), 'setup codex skill missing profile suggestion guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory apply-profile-update --candidate <id|index> --dry-run'), 'setup codex skill missing profile apply dry-run guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory apply-preference-signals --prompt'), 'setup codex skill missing preference apply dry-run guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook why'), 'setup claude skill missing why guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook project --json'), 'setup claude skill missing project json guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook learner --json') || (await readFile(claudeSkill, 'utf8')).includes('contextbook memory context --json'), 'setup claude skill missing learner/memory context guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory context --json'), 'setup claude skill missing memory context guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory add-signal'), 'setup claude skill missing memory signal guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory capture-prompt'), 'setup claude skill missing prompt capture guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory suggest-weak-terms --json'), 'setup claude skill missing weak suggestion guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory suggest-profile-updates --json'), 'setup claude skill missing profile suggestion guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory apply-profile-update --candidate <id|index> --dry-run'), 'setup claude skill missing profile apply dry-run guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory apply-preference-signals --prompt'), 'setup claude skill missing preference apply dry-run guidance');
  assert(!existsSync(codexHookScript) && !existsSync(claudeHookScript), 'default setup installed hook files without --hooks');

  const setupHooksInstall = run(['setup', '--hooks']);
  assert(setupHooksInstall.includes('created') && setupHooksInstall.includes('Hook helpers are opt-in'), 'setup --hooks did not install hook helpers');
  const codexHookScriptText = await readFile(codexHookScript, 'utf8');
  const codexHookGuideText = await readFile(codexHookGuide, 'utf8');
  const claudeHookScriptText = await readFile(claudeHookScript, 'utf8');
  const claudeHookGuideText = await readFile(claudeHookGuide, 'utf8');
  for (const [label, text, source] of [['codex', codexHookScriptText, 'codex'], ['claude', claudeHookScriptText, 'claude-code']]) {
    assert(text.includes('spawnSync') && text.includes('memory') && text.includes('capture-prompt'), `${label} hook script missing capture-prompt spawn`);
    assert(text.includes(`'${source}'`), `${label} hook script missing source`);
    assert(!text.includes('transcript_path'), `${label} hook script should not parse transcript path`);
  }
  assert(codexHookGuideText.includes('~/.codex/hooks.json') && codexHookGuideText.includes('UserPromptSubmit') && codexHookGuideText.includes('review and trust'), 'codex hook guide missing config/trust guidance');
  assert(claudeHookGuideText.includes('~/.claude/settings.json') && claudeHookGuideText.includes('UserPromptSubmit'), 'claude hook guide missing config guidance');
  const hooksStatusAfterSetup = JSON.parse(run(['hooks', 'status', '--json']));
  const codexPlatform = hooksStatusAfterSetup.platforms.find((platform) => platform.id === 'codex');
  const claudePlatform = hooksStatusAfterSetup.platforms.find((platform) => platform.id === 'claude-code');
  assert(codexPlatform?.helper.exists === true && claudePlatform?.helper.exists === true, 'hooks status after setup should find helper scripts');
  assert(codexPlatform.runtime.helperSmoke === 'ok' && claudePlatform.runtime.helperSmoke === 'ok', 'hooks status should smoke test installed helpers with empty prompt');
  assert(codexPlatform.configs.every((config) => config.status !== 'enabled') && claudePlatform.configs.every((config) => config.status !== 'enabled'), 'hooks status should not mark hooks enabled before config snippets are merged');
  assert(codexPlatform.recommendedActions.some((action) => action.command.includes('~/.codex/hooks.json')), 'codex hooks status missing config merge action');
  assert(claudePlatform.recommendedActions.some((action) => action.command.includes('~/.claude/settings.json')), 'claude hooks status missing config merge action');

  await mkdir(join(home, '.codex'), { recursive: true });
  await writeFile(join(home, '.codex', 'hooks.json'), JSON.stringify({
    hooks: {
      UserPromptSubmit: [{
        hooks: [{ type: 'command', command: `node \"${codexHookScript}\"`, timeout: 30 }]
      }]
    }
  }, null, 2), 'utf8');
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude', 'settings.json'), JSON.stringify({
    hooks: {
      UserPromptSubmit: [{
        hooks: [{ type: 'command', command: `node \"${claudeHookScript}\"`, timeout: 30 }]
      }]
    }
  }, null, 2), 'utf8');
  await mkdir(join(root, '.codex'), { recursive: true });
  await writeFile(join(root, '.codex', 'hooks.json'), '{ invalid json', 'utf8');
  const signalsBeforeHookStatus = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const hooksStatusEnabled = JSON.parse(run(['hooks', 'status', '--json']));
  const codexEnabled = hooksStatusEnabled.platforms.find((platform) => platform.id === 'codex');
  const claudeEnabled = hooksStatusEnabled.platforms.find((platform) => platform.id === 'claude-code');
  assert(codexEnabled.configs.some((config) => config.status === 'enabled'), 'codex hooks status should detect enabled hooks.json');
  assert(codexEnabled.configs.some((config) => config.status === 'parse-error'), 'codex hooks status should report invalid project hooks json as parse-error');
  assert(claudeEnabled.configs.some((config) => config.status === 'enabled'), 'claude hooks status should detect enabled settings json');
  assert(hooksStatusEnabled.safety.learnerMemoryMutated === false && hooksStatusEnabled.safety.rawPromptPersisted === false, 'hooks status safety flags should prohibit memory/raw prompt writes');
  const signalsAfterHookStatus = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  assert(signalsAfterHookStatus === signalsBeforeHookStatus, 'hooks status should not mutate conversation memory while smoke testing helpers');

  for (const [label, script] of [['codex', codexHookScript], ['claude', claudeHookScript]]) {
    const syntaxRun = spawnSync(process.execPath, [script], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '' }),
      encoding: 'utf8'
    });
    assert(syntaxRun.status === 0, `${label} hook script should run under plain node without ESM package context`);
    const missingBinaryRun = spawnSync(process.execPath, [script], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '뭔소리야 너무 추상적임' }),
      env: { ...process.env, PATH: '' },
      encoding: 'utf8'
    });
    assert(missingBinaryRun.status === 0, `${label} hook script should not block when contextbook binary is unavailable`);
  }
  await writeFile(codexHookScript, '#!/usr/bin/env node\nconsole.log(\"custom\");\n', 'utf8');
  const tamperedStatus = JSON.parse(run(['hooks', 'status', '--json']));
  const tamperedCodex = tamperedStatus.platforms.find((platform) => platform.id === 'codex');
  assert(tamperedCodex.runtime.helperSmoke === 'skipped', 'hooks status should not execute modified helper scripts');
  const restoredCodexHook = run(['install', 'codex', '--hooks']);
  assert(restoredCodexHook.includes('updated with backup'), 'codex hook script restore should back up modified helper');

  const setupHooksAgain = run(['setup', '--hooks']);
  assert(setupHooksAgain.includes('skipped identical'), 'setup --hooks reinstall did not skip identical files');

  const codexInstall = run(['install', 'codex']);
  assert(codexInstall.includes('skipped identical'), 'codex install after setup did not skip identical file');
  assert(existsSync(codexHookScript), 'codex install without --hooks should not remove existing hook file');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook learn'), 'codex skill missing learn guidance');
  const codexInstallAgain = run(['install', 'codex']);
  assert(codexInstallAgain.includes('skipped identical'), 'codex reinstall did not skip identical file');
  const codexLegacyInstall = run(['install', 'codex', '--codex-path', 'agents']);
  assert(codexLegacyInstall.includes('created'), 'codex explicit historical agents install did not create compatibility file');
  assert((await readFile(codexLegacySkill, 'utf8')).includes('contextbook learn'), 'codex legacy skill missing learn guidance');

  const claudeInstall = run(['install', 'claude-code']);
  assert(claudeInstall.includes('skipped identical'), 'claude install after setup did not skip identical files');
  assert(existsSync(claudeHookScript), 'claude install without --hooks should not remove existing hook file');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook why'), 'claude skill missing why guidance');
  assert((await readFile(claudeLearn, 'utf8')).includes('contextbook learn'), 'claude learn command missing CLI guidance');
  assert((await readFile(claudeLearn, 'utf8')).includes('contextbook memory context --json'), 'claude learn command missing memory context guidance');
  assert((await readFile(claudeLearn, 'utf8')).includes('contextbook memory apply-profile-update --candidate <id|index> --dry-run'), 'claude learn command missing profile apply dry-run guidance');
  assert((await readFile(claudeWhy, 'utf8')).includes('$ARGUMENTS'), 'claude why command missing argument placeholder');

  await writeFile(codexHookGuide, 'custom codex hook guide\n', 'utf8');
  const codexHookUpdate = run(['install', 'codex', '--hooks']);
  assert(codexHookUpdate.includes('updated with backup'), 'codex changed hook guide was not backed up before update');
  const codexHookDirEntries = await readdir(join(home, '.codex', 'hooks'));
  assert(codexHookDirEntries.some((entry) => entry.startsWith('contextbook-user-prompt-submit.md.bak-')), 'backup file missing for changed codex hook guide');

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
