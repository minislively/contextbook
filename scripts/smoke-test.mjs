import { mkdtemp, writeFile, mkdir, rm, readFile, readdir, chmod, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'contextbook-smoke-'));
const home = await mkdtemp(join(tmpdir(), 'contextbook-home-'));
const repoRoot = new URL('..', import.meta.url).pathname;
const cli = new URL('../dist/cli.js', import.meta.url).pathname;
const learnerDir = join(home, '.contextbook', 'learners', 'default');

function runIn(cwd, homeDir, args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, EDITOR: '' },
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

function legacyClaudeLearnCommandContent() {
  return `---
description: Generate Contextbook learning moments from the current repository.
---

Run Contextbook locally and report the result without inventing extra evidence:

1. Run \`contextbook scan\` if project evidence may be stale.
2. Run \`contextbook memory context --json\` for the one-shot AI context bundle before summarizing.
3. Run lower-level \`contextbook project --json\`, \`contextbook learner --json\`, or suggestion commands only when debugging a specific layer.
4. If a profile update candidate matters, preview it with \`contextbook memory apply-profile-update --candidate <id|index> --dry-run\` and wait for explicit user approval before applying.
5. If the user explicitly states a safe preference, preview \`contextbook memory apply-preference-signals --prompt "$ARGUMENTS" --source claude-code --mode auto-safe --dry-run\`; generated setup hooks may apply only low-risk auto-safe preferences.
6. Run \`contextbook learn\`.
7. Preserve the evidence level and evidence files from the output.
`;
}

function legacyClaudeWhyCommandContent() {
  return `---
description: Answer a concept question with Contextbook project evidence.
---

Answer this question using Contextbook:

$ARGUMENTS

Run:

\`\`\`bash
contextbook why "$ARGUMENTS"
\`\`\`

Preserve the evidence level, natural project-grounded explanation, and evidence files; do not force old visible atom headings. If Contextbook says evidence is \`general\`, do not imply the concept was found directly in the project.
`;
}

function legacyCodexLearnSkillContent(name) {
  return `---
name: ${name}
description: Generate Contextbook learning moments from the current repository using local project evidence.
---

# Contextbook Learn

Use this skill when the user asks what they can learn from the code they just touched.

## Workflow

1. Prefer deterministic local evidence over generic explanation.
2. If project memory may be stale, run:
   \`\`\`bash
   contextbook scan
   \`\`\`
3. Load the one-shot AI context bundle:
   \`\`\`bash
   contextbook memory context --json
   \`\`\`
4. Generate learning moments:
   \`\`\`bash
   contextbook learn
   \`\`\`
5. Preserve Contextbook's evidence level and evidence files. Do not invent project evidence.
`;
}

function legacyCodexWhySkillContent(name) {
  return `---
name: ${name}
description: Answer why a development or CS concept matters in this repository using Contextbook project evidence.
---

# Contextbook Why

Use this skill when the user asks why a concept, pattern, or code behavior matters in this project.

## Workflow

1. Treat text after the skill name as the question. For example, in \`$why "cleanup 왜 해야 돼?"\`, \`cleanup 왜 해야 돼?\` is the question text, not a cleanup command.
2. Prefer deterministic local evidence over generic explanation.
3. Run:
   \`\`\`bash
   contextbook why "<question>"
   \`\`\`
4. Preserve the evidence level, natural project-grounded explanation, and evidence files; do not force old visible atom headings.
5. If Contextbook says evidence is \`general\`, do not imply the concept was found directly in the project.
`;
}

async function seedDeprecatedAliases(homeDir, rootDir = '.codex') {
  const codexLearn = join(homeDir, rootDir, 'skills', 'contextbook-learn', 'SKILL.md');
  const codexWhy = join(homeDir, rootDir, 'skills', 'contextbook-why', 'SKILL.md');
  await mkdir(join(homeDir, rootDir, 'skills', 'contextbook-learn'), { recursive: true });
  await mkdir(join(homeDir, rootDir, 'skills', 'contextbook-why'), { recursive: true });
  await writeFile(codexLearn, legacyCodexLearnSkillContent('contextbook-learn'), 'utf8');
  await writeFile(codexWhy, legacyCodexWhySkillContent('contextbook-why'), 'utf8');
}

async function seedDeprecatedClaudeAliases(homeDir) {
  await mkdir(join(homeDir, '.claude', 'commands'), { recursive: true });
  await writeFile(join(homeDir, '.claude', 'commands', 'contextbook-learn.md'), legacyClaudeLearnCommandContent(), 'utf8');
  await writeFile(join(homeDir, '.claude', 'commands', 'contextbook-why.md'), legacyClaudeWhyCommandContent(), 'utf8');
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
  for (const text of ['contextbook setup', 'contextbook setup --dry-run', 'contextbook doctor', 'contextbook doctor --json', 'contextbook setup --auto --dry-run', 'contextbook hooks status', 'contextbook hooks status --json', 'contextbook hooks smoke', 'contextbook project', 'contextbook project --json', 'contextbook learner', 'contextbook learner --json', 'contextbook memory add-signal', 'contextbook memory capture-prompt', 'contextbook memory hook-suggest', 'contextbook memory signals --json', 'contextbook memory suggest-weak-terms --json', 'contextbook memory suggest-profile-updates --json', 'contextbook memory apply-profile-update', 'contextbook memory apply-preference-signals', 'contextbook memory preference-history', 'contextbook memory undo-preference-update', 'contextbook memory context --json', 'contextbook memory recover', 'contextbook memory recover --json', 'contextbook memory recover --safe', 'contextbook memory recover --safe --json', 'contextbook memory validate', 'contextbook memory validate --json', 'contextbook memory repair --dry-run', 'contextbook memory repair --dry-run --json', 'contextbook memory repair --yes', 'contextbook memory repair --yes --json', 'contextbook memory rebuild --dry-run', 'contextbook memory rebuild --dry-run --json', 'contextbook memory rebuild --yes', 'contextbook memory rebuild --yes --json', 'contextbook memory backup --dry-run', 'contextbook memory backup --dry-run --json', 'contextbook memory backup --yes', 'contextbook memory backup --yes --json', 'contextbook memory restore --backup-id <id> --dry-run', 'contextbook memory restore --backup-id <id> --dry-run --json', 'contextbook memory restore --backup-id <id> --yes', 'contextbook memory restore --backup-id <id> --yes --json', 'contextbook profile diff', 'contextbook profile edit', 'contextbook profile reset', 'contextbook install all --dry-run', 'contextbook install codex --dry-run', 'contextbook install codex --codex-path both --dry-run', 'contextbook install claude-code --dry-run', 'contextbook install codex --hooks --dry-run', 'contextbook install claude-code --hooks --dry-run']) {
    assert(readme.includes(text), `README missing ${text}`);
  }

  const help = run(['--help'], { cwd: repoRoot });
  for (const text of ['contextbook doctor [--json]', 'contextbook project [--json]', 'contextbook learner [--json]', 'contextbook memory add-signal --type <type> [--concept <concept>] [--note <note>]', 'contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]', 'contextbook memory hook-suggest --prompt <text> [--source manual|codex|claude-code] [--mode suggest|auto-safe] [--include-memory-context] [--json]', 'contextbook memory signals [--json]', 'contextbook memory suggest-weak-terms [--json]', 'contextbook memory suggest-profile-updates [--json]', 'contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]', 'contextbook memory apply-preference-signals --prompt <text> [--source manual|codex|claude-code] [--mode manual|suggest|auto-safe] [--dry-run] [--json]', 'contextbook memory preference-history [--json]', 'contextbook memory undo-preference-update --entry <id|index> (--dry-run|--yes) [--json]', 'contextbook memory context [--json]', 'contextbook memory recover [--safe] [--json]', 'contextbook memory validate [--json]', 'contextbook memory repair (--dry-run|--yes) [--json]', 'contextbook memory rebuild (--dry-run|--yes) [--json]', 'contextbook memory backup (--dry-run|--yes) [--json]', 'contextbook memory restore --backup-id <id> (--dry-run|--yes) [--json]', 'contextbook profile diff', 'contextbook profile edit', 'contextbook profile reset', 'contextbook setup [--dry-run] [--auto]', 'contextbook hooks status [--json]', 'contextbook hooks smoke --prompt <text> [--platform codex|claude-code|all] [--json]', 'contextbook install all [--dry-run] [--hooks] [--auto] [--codex-path auto|agents|codex|both]', 'contextbook install codex [--dry-run] [--hooks] [--auto] [--codex-path auto|agents|codex|both]', 'contextbook install claude-code [--dry-run] [--hooks] [--auto]']) {
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

  const doctorBeforeInit = run(['doctor']);
  assert(doctorBeforeInit.includes('# Contextbook Doctor') && doctorBeforeInit.includes('project status: missing'), 'doctor before init missing project status');
  assert(doctorBeforeInit.includes('contextbook init') && doctorBeforeInit.includes('contextbook scan'), 'doctor before init missing next action hints');
  const doctorJsonBeforeInit = JSON.parse(run(['doctor', '--json']));
  assert(doctorJsonBeforeInit.schemaVersion === 1 && doctorJsonBeforeInit.project.status === 'missing', 'doctor json before init invalid');
  assert(doctorJsonBeforeInit.safety.readOnly === true && doctorJsonBeforeInit.safety.projectMemoryMutated === false && doctorJsonBeforeInit.safety.learnerMemoryMutated === false, 'doctor json safety invalid');
  assert(runExpectFail(['doctor', '--bad']).includes('Usage: contextbook doctor [--json]'), 'doctor invalid usage should fail');

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
  const memoryRecoverBefore = JSON.parse(run(['memory', 'recover', '--json']));
  assert(memoryRecoverBefore.schemaVersion === 1 && memoryRecoverBefore.primaryCase === 'missing-files', 'memory recover before init should route missing files');
  assert(memoryRecoverBefore.recommendedFlow.some((step) => step.command === 'contextbook memory repair --dry-run' && step.writes === false), 'memory recover before init missing repair dry-run');
  assert(memoryRecoverBefore.recommendedFlow.some((step) => step.command === 'contextbook memory repair --yes' && step.requiresYes === true), 'memory recover before init missing repair yes');
  assert(memoryRecoverBefore.safety.readOnly === true && memoryRecoverBefore.safety.projectMemoryMutated === false && memoryRecoverBefore.safety.learnerMemoryMutated === false, 'memory recover before init safety invalid');
  assert(!JSON.stringify(memoryRecoverBefore).includes(root) && !JSON.stringify(memoryRecoverBefore).includes(home), 'memory recover before init leaked absolute path');
  const safeRoot = await mkdtemp(join(tmpdir(), 'contextbook-safe-recover-'));
  const safeHome = await mkdtemp(join(tmpdir(), 'contextbook-safe-home-'));
  await writeFile(join(safeRoot, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0' } }, null, 2), 'utf8');
  await mkdir(join(safeRoot, 'src'), { recursive: true });
  await writeFile(join(safeRoot, 'src', 'safe.ts'), 'export const value = new EventSource("/events");\n', 'utf8');
  const safeRecoverBeforeInit = JSON.parse(runIn(safeRoot, safeHome, ['memory', 'recover', '--safe', '--json']));
  assert(safeRecoverBeforeInit.mode === 'safe' && safeRecoverBeforeInit.diagnosis.safety.readOnly === true, 'memory recover safe before init missing safe/diagnosis contract');
  assert(!safeRecoverBeforeInit.appliedActions.some((action) => action.kind === 'repair'), 'memory recover safe before init should not auto-repair learner/conversation memory');
  assert(safeRecoverBeforeInit.appliedActions.some((action) => action.kind === 'rebuild'), 'memory recover safe before init did not rebuild scan artifacts');
  assert(safeRecoverBeforeInit.blockedActions.some((action) => action.kind === 'repair'), 'memory recover safe before init should leave learner repair explicit');
  assert(safeRecoverBeforeInit.safety.projectMemoryMutated === true && safeRecoverBeforeInit.safety.learnerMemoryMutated === false && safeRecoverBeforeInit.safety.backupCreated === true, 'memory recover safe before init safety mutation flags invalid');
  assert(existsSync(join(safeRoot, '.contextbook', 'project', 'scan-runs.jsonl')), 'memory recover safe before init did not create scan runs');
  assert((await readJsonl(join(safeRoot, '.contextbook', 'project', 'scan-runs.jsonl'))).length >= 1, 'memory recover safe before init did not append scan run');
  assert(!existsSync(join(safeHome, '.contextbook', 'learners', 'default', 'signals.jsonl')), 'memory recover safe before init should not create learner conversation memory');
  assert(!JSON.stringify(safeRecoverBeforeInit).includes(safeRoot) && !JSON.stringify(safeRecoverBeforeInit).includes(safeHome), 'memory recover safe before init leaked absolute path');
  const unsafeRoot = await mkdtemp(join(tmpdir(), 'contextbook-safe-unsafe-'));
  const unsafeHome = await mkdtemp(join(tmpdir(), 'contextbook-safe-unsafe-home-'));
  await mkdir(join(unsafeRoot, '.contextbook'), { recursive: true });
  await mkdir(join(unsafeRoot, 'unsafe-target'), { recursive: true });
  await symlink(join(unsafeRoot, 'unsafe-target'), join(unsafeRoot, '.contextbook', 'project'));
  const unsafeSafeRecover = JSON.parse(runIn(unsafeRoot, unsafeHome, ['memory', 'recover', '--safe', '--json']));
  assert(unsafeSafeRecover.status === 'blocked' && unsafeSafeRecover.appliedActions.length === 0, 'memory recover safe should block unsafe project symlink');
  assert(unsafeSafeRecover.blockedActions.some((action) => action.kind === 'rebuild' && JSON.stringify(action.blockedBy).includes('UNSAFE_REBUILD_PATH')), 'memory recover safe unsafe path missing stable error code');
  const safeRecoverMarkdown = runIn(safeRoot, safeHome, ['memory', 'recover', '--safe']);
  assert(safeRecoverMarkdown.includes('# Contextbook Memory Safe Recovery') && safeRecoverMarkdown.includes('## Auto-applied') && safeRecoverMarkdown.includes('## Still Explicit'), 'memory recover safe markdown missing sections');
  assert(runExpectFail(['memory', 'recover', '--yes']).includes('Usage: contextbook memory recover [--safe] [--json]'), 'memory recover --yes should fail');
  assert(!existsSync(join(root, '.contextbook')), 'memory recover should be read-only before init');
  const memoryValidateBefore = JSON.parse(run(['memory', 'validate', '--json']));
  assert(memoryValidateBefore.schemaVersion === 1 && memoryValidateBefore.status === 'warning', 'memory validate before init should warn');
  assert(memoryValidateBefore.issues.some((issue) => issue.scope === 'project' && issue.code === 'missing-file' && issue.recommendedCommand === 'contextbook init'), 'memory validate before init missing project warning');
  assert(memoryValidateBefore.safety.readOnly === true && memoryValidateBefore.safety.projectMemoryMutated === false && memoryValidateBefore.safety.learnerMemoryMutated === false, 'memory validate safety invalid before init');
  assert(!JSON.stringify(memoryValidateBefore).includes(root) && !JSON.stringify(memoryValidateBefore).includes(home), 'memory validate before init leaked absolute path');
  const memoryValidateBadFlag = runExpectFail(['memory', 'validate', '--bad']);
  assert(memoryValidateBadFlag.includes('Usage: contextbook memory validate [--json]'), 'memory validate unknown flag missing usage guidance');
  const memoryRepairBefore = JSON.parse(run(['memory', 'repair', '--dry-run', '--json']));
  assert(memoryRepairBefore.schemaVersion === 1 && memoryRepairBefore.dryRun === true && memoryRepairBefore.status === 'warning', 'memory repair dry-run before init should warn');
  assert(memoryRepairBefore.operations.some((operation) => operation.issueCode === 'missing-file' && operation.supported === true && operation.wouldWrite === true), 'memory repair dry-run before init missing supported missing-file operation');
  assert(memoryRepairBefore.safety.dryRunOnly === true && memoryRepairBefore.safety.readOnly === true && memoryRepairBefore.safety.projectMemoryMutated === false, 'memory repair dry-run safety invalid before init');
  assert(!JSON.stringify(memoryRepairBefore).includes(root) && !JSON.stringify(memoryRepairBefore).includes(home), 'memory repair dry-run before init leaked absolute path');
  assert(runExpectFail(['memory', 'repair', '--json']).includes('Usage: contextbook memory repair (--dry-run|--yes) [--json]'), 'memory repair without mode should fail');
  assert(runExpectFail(['memory', 'repair', '--dry-run', '--bad']).includes('Usage: contextbook memory repair (--dry-run|--yes) [--json]'), 'memory repair unknown flag missing usage guidance');
  assert(runExpectFail(['memory', 'repair', '--dry-run', '--yes']).includes('Usage: contextbook memory repair (--dry-run|--yes) [--json]'), 'memory repair dry-run plus yes should fail');
  const memoryRebuildBefore = JSON.parse(run(['memory', 'rebuild', '--dry-run', '--json']));
  assert(memoryRebuildBefore.schemaVersion === 1 && memoryRebuildBefore.dryRun === true && memoryRebuildBefore.status === 'warning', 'memory rebuild dry-run before init should warn');
  assert(memoryRebuildBefore.preview.filesScanned >= 1 && memoryRebuildBefore.operations.some((operation) => operation.operation === 'replace-project-concepts'), 'memory rebuild dry-run before init missing project rebuild operation');
  assert(memoryRebuildBefore.operations.some((operation) => operation.operation === 'preserve-learner-memory' && operation.wouldWrite === false), 'memory rebuild dry-run missing learner preserve operation');
  assert(memoryRebuildBefore.safety.readOnly === true && memoryRebuildBefore.safety.projectMemoryMutated === false && memoryRebuildBefore.safety.conversationMemoryMutated === false, 'memory rebuild dry-run safety invalid before init');
  assert(!JSON.stringify(memoryRebuildBefore).includes(root) && !JSON.stringify(memoryRebuildBefore).includes(home), 'memory rebuild dry-run before init leaked absolute path');
  assert(runExpectFail(['memory', 'rebuild', '--json']).includes('Usage: contextbook memory rebuild (--dry-run|--yes) [--json]'), 'memory rebuild without dry-run should fail');
  assert(runExpectFail(['memory', 'rebuild', '--dry-run', '--bad']).includes('Usage: contextbook memory rebuild (--dry-run|--yes) [--json]'), 'memory rebuild unknown flag missing usage guidance');
  const memoryBackupBefore = JSON.parse(run(['memory', 'backup', '--dry-run', '--json']));
  assert(memoryBackupBefore.schemaVersion === 1 && memoryBackupBefore.dryRun === true && memoryBackupBefore.status === 'warning', 'memory backup dry-run before init should warn');
  assert(Array.isArray(memoryBackupBefore.manifest.items) && memoryBackupBefore.manifest.items.length >= 11, 'memory backup dry-run before init missing manifest items');
  assert(memoryBackupBefore.summary.missing > 0 && memoryBackupBefore.summary.inspectErrors === 0 && memoryBackupBefore.summary.files === memoryBackupBefore.manifest.items.length, 'memory backup dry-run before init summary invalid');
  assert(memoryBackupBefore.safety.backupCreated === false && memoryBackupBefore.safety.rawContentIncluded === false && memoryBackupBefore.safety.absolutePathsIncluded === false, 'memory backup dry-run safety invalid before init');
  assert(!JSON.stringify(memoryBackupBefore).includes(root) && !JSON.stringify(memoryBackupBefore).includes(home), 'memory backup dry-run before init leaked absolute path');
  assert(runExpectFail(['memory', 'backup', '--json']).includes('Usage: contextbook memory backup (--dry-run|--yes) [--json]'), 'memory backup without dry-run should fail');
  assert(runExpectFail(['memory', 'backup', '--dry-run', '--bad']).includes('Usage: contextbook memory backup (--dry-run|--yes) [--json]'), 'memory backup unknown flag missing usage guidance');
  assert(!existsSync(join(root, '.contextbook')), 'memory context/validate/repair/rebuild/backup dry-run should not create project memory before init');
  const memoryRepairApplyBefore = JSON.parse(run(['memory', 'repair', '--yes', '--json']));
  assert(memoryRepairApplyBefore.schemaVersion === 1 && memoryRepairApplyBefore.dryRun === false && memoryRepairApplyBefore.repairApplied === true, 'memory repair --yes before init json contract invalid');
  assert(memoryRepairApplyBefore.preRepairBackupId && memoryRepairApplyBefore.safety.preRepairBackupCreated === true, 'memory repair --yes before init should create pre-repair backup');
  assert(memoryRepairApplyBefore.applied.written >= 5 && memoryRepairApplyBefore.postValidationStatus === 'ok', 'memory repair --yes before init did not recreate missing memory defaults');
  assert(existsSync(join(root, '.contextbook', 'project', 'config.json')), 'memory repair --yes before init did not create project config');
  assert(existsSync(join(learnerDir, 'profile.md')), 'memory repair --yes before init did not create learner profile');
  assert(!JSON.stringify(memoryRepairApplyBefore).includes(root) && !JSON.stringify(memoryRepairApplyBefore).includes(home), 'memory repair --yes before init leaked absolute path');

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
  const healthySafeRecover = JSON.parse(run(['memory', 'recover', '--safe', '--json']));
  assert(healthySafeRecover.mode === 'safe' && healthySafeRecover.appliedActions.length === 0, 'memory recover safe healthy path should no-op');
  assert(healthySafeRecover.safety.projectMemoryMutated === false && healthySafeRecover.safety.learnerMemoryMutated === false && healthySafeRecover.safety.backupCreated === false, 'memory recover safe healthy no-op safety invalid');
  assert(healthySafeRecover.diagnosis.safety.readOnly === true, 'memory recover safe healthy diagnosis should be read-only');
  const core = await import('../dist/core/index.js');
  const explanationFormat = await import('../dist/format/explanation.js');
  const responsePlanFormat = await import('../dist/format/response-plan.js');
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
  assert(typeof scanRun.workingTreeFingerprint === 'string' && scanRun.workingTreeFingerprint.length >= 16, 'scan run missing working tree fingerprint');
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
  assert(!learn.includes('docs/private/'), 'learn output included private docs evidence');
  for (const line of learn.split('\n').filter((item) => item.startsWith('근거 파일:'))) {
    const listed = line.replace('근거 파일:', '').split(',').map((item) => item.trim()).filter(Boolean);
    assert(listed.length <= 3, 'learn output showed more than 3 evidence files for one concept');
  }
  assert(!learn.includes(root) && !learn.includes(home), 'learn output included absolute local path');
  assert(!learn.includes('SECRET_TOKEN') && !learn.includes('should-not-leak'), 'learn output included hidden file content');
  assert(!existsSync(join(root, '.contextbook', 'project', 'ranking-reasons.json')), 'learn created a ranking-reasons project memory artifact');

  const preferencesPath = join(learnerDir, 'preferences.json');
  await writeFile(preferencesPath, JSON.stringify({
    explanationOrder: ['interview-sentence', 'project', 'plain', 'developer-term', 'cs-link'],
    avoid: []
  }, null, 2), 'utf8');
  const planSignals = responsePlanFormat.eligibleWhyResponseSignals([
    { signalType: 'why.answered', recordedAt: '2026-01-03T00:00:00.000Z', metadata: { format: 'project-first' } },
    { signalType: 'feedback.confused', recordedAt: '2026-01-02T00:00:00.000Z' },
    { signalType: 'format.requested', recordedAt: '2026-01-01T00:00:00.000Z', metadata: { format: 'plain' } }
  ]);
  assert(planSignals.length === 2 && planSignals.every((item) => item.signalType !== 'why.answered'), 'why response plan should filter out why.answered');
  const responsePlan = responsePlanFormat.buildWhyResponsePlan({ explanationOrder: ['interview-sentence', 'project', 'plain', 'developer-term', 'cs-link'], avoid: [] }, planSignals);
  assert(responsePlan.density === 'compact' && responsePlan.lead === 'plain' && responsePlan.includeInterviewLine === true, 'why response plan should expose semantic renderer-backed controls');
  assert(responsePlan.density === 'compact' && responsePlan.reasons.includes('recent-confusion-feedback') && responsePlan.reasons.includes('format-requested:plain'), 'why response plan missing signal-driven reasons');
  const defaultPlan = responsePlanFormat.buildWhyResponsePlan({ explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'], avoid: [] }, []);
  const interviewPlan = responsePlanFormat.buildWhyResponsePlan({ explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'], avoid: [] }, [
    { signalType: 'format.requested', recordedAt: '2026-01-04T00:00:00.000Z', metadata: { format: 'interview' } }
  ]);
  const plainPlan = responsePlanFormat.buildWhyResponsePlan({ explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'], avoid: [] }, [
    { signalType: 'format.requested', recordedAt: '2026-01-05T00:00:00.000Z', metadata: { format: 'plain' } }
  ]);
  const defaultRendered = explanationFormat.formatWhyAnswer('cleanup 왜 해야 돼?', undefined, { id: 'use-effect-cleanup', label: 'useEffect cleanup / lifecycle' }, { explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'], avoid: [] }, defaultPlan);
  const shortRendered = explanationFormat.formatWhyAnswer('cleanup 왜 해야 돼?', undefined, { id: 'use-effect-cleanup', label: 'useEffect cleanup / lifecycle' }, { explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'], avoid: [] }, responsePlan);
  const interviewFirstRendered = explanationFormat.formatWhyAnswer('cleanup 왜 해야 돼?', undefined, { id: 'use-effect-cleanup', label: 'useEffect cleanup / lifecycle' }, { explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'], avoid: [] }, interviewPlan);
  const plainFirstRendered = explanationFormat.formatWhyAnswer('cleanup 왜 해야 돼?', undefined, { id: 'use-effect-cleanup', label: 'useEffect cleanup / lifecycle' }, { explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'], avoid: [] }, plainPlan);
  assert(shortRendered !== defaultRendered && shortRendered.includes('개발자/CS 관점으로는') && !shortRendered.includes('개발자 관점에서는'), 'short response plan should change rendered output');
  assert(interviewPlan.reasons.includes('format-requested:interview') && interviewFirstRendered !== defaultRendered && interviewFirstRendered.indexOf('컴포넌트 생명주기') < interviewFirstRendered.indexOf('이 프로젝트'), 'captured interview format signal should affect narrative output');
  assert(plainPlan.reasons.includes('format-requested:plain') && plainFirstRendered !== defaultRendered && plainFirstRendered.indexOf('열어둔 연결') < plainFirstRendered.indexOf('이 프로젝트'), 'captured plain format signal should affect narrative output');
  const conflictingFormatPlan = responsePlanFormat.buildWhyResponsePlan({ explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'], avoid: [] }, [
    { signalType: 'format.requested', recordedAt: '2026-01-06T00:00:00.000Z', metadata: { format: 'plain' } },
    { signalType: 'format.requested', recordedAt: '2026-01-01T00:00:00.000Z', metadata: { format: 'project-first' } }
  ]);
  assert(conflictingFormatPlan.lead === 'plain', 'newest format signal should win over older conflicting format signals');
  const why = run(['why', 'cleanup 왜 해야 돼?']);
  const coreWhy = await core.answerWhy('cleanup 왜 해야 돼?', { root, learner: 'default' });
  assert(coreWhy.markdown.includes('근거 수준:'), 'core why contract did not return evidence marker');
  assert(coreWhy.evidenceLevel === 'direct' || coreWhy.evidenceLevel === 'related', 'core why contract did not return project evidence level');
  for (const marker of ['근거 수준:', '근거 파일:', 'useEffect cleanup', 'resource lifecycle', '컴포넌트 생명주기']) {
    assert(why.includes(marker), `why missing ${marker}`);
  }
  for (const oldHeading of ['## 프로젝트 말로 설명', '## 쉬운 말', '## 개발자 용어', '## CS 연결', '## 면접 문장']) {
    assert(!why.includes(oldHeading), `why should not use old section dump heading ${oldHeading}`);
  }
  assert(why.includes('- src/hooks/useWorkflowSSE.ts'), 'why missing direct evidence file bullet');
  const generalWhy = runIn(await mkdtemp(join(tmpdir(), 'contextbook-general-')), home, ['why', 'debounce 왜 필요해?']);
  assert(generalWhy.includes('근거 수준: general') && generalWhy.includes('근거 파일:') && generalWhy.includes('프로젝트 근거 없음'), 'general why missing evidence fallback markers');

  const wordingFiles = ['templates/prompts/why.md', 'src/storage/project-store.ts', 'src/codex/install.ts', 'src/claude-code/install.ts', 'scripts/release-smoke.mjs'];
  for (const file of wordingFiles) {
    const content = await readFile(join(repoRoot, file), 'utf8');
    assert(content.includes('natural project-grounded') || content.includes('natural evidence-shell') || content.includes('evidence level and evidence files'), `${file} missing natural evidence-shell wording`);
    assert(!content.includes('project-language explanation, CS connection, interview sentence'), `${file} still requires old visible atom contract`);
  }

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
  assert(mixedCapture.preferenceSignals.every((item) => item.intent && item.scope && item.risk && item.policy && Array.isArray(item.scopeEvidence)), 'mixed capture missing intent/scope/risk/policy contract');
  assert(mixedCapture.preferenceSignals.some((item) => item.scope === 'persistent-candidate' && item.policy === 'dry-run-only' && item.scopeEvidence.includes('negative-constraint')), 'mixed capture should expose persistent candidate evidence without applying');
  assert(mixedCapture.safety.preferencesMutated === false && mixedCapture.safety.profileMutated === false, 'mixed capture mutated profile/preferences');
  const koreanCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '앞으로 한국어로 설명해줘. 영어보다 한국어가 좋아.', '--source', 'manual', '--json']));
  assert(koreanCapture.preferenceSignals.some((item) => item.dimension === 'language' && item.value === 'ko' && item.route === 'auto-apply-safe'), 'language capture missing ko preference');
  const selfJudgmentCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '나는 CS를 못해서 그런가 이해가 잘 안 돼.', '--source', 'manual', '--json']));
  assert(selfJudgmentCapture.preferenceSignals.some((item) => item.dimension === 'self-assessment'), 'self judgment capture missing self-assessment signal');
  assert(!selfJudgmentCapture.preferenceSignals.some((item) => item.dimension === 'self-assessment' && item.route === 'auto-apply-safe'), 'self judgment must not be auto-apply safe');
  assert(selfJudgmentCapture.preferenceSignals.some((item) => item.dimension === 'self-assessment' && item.intent === 'unsafe-self-assessment' && item.risk === 'high' && item.policy === 'observe-only' && item.scopeEvidence.includes('unsafe-self-assessment')), 'self judgment should be high-risk observe-only metadata');
  assert(selfJudgmentCapture.safety.unsafeJudgmentIncluded === false, 'self judgment safety flag should remain false');
  const taskLocalCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '이번 답변만 영어로 짧게 해줘', '--source', 'manual', '--json']));
  assert(taskLocalCapture.preferenceSignals.some((item) => item.scopeEvidence.includes('task-local-cue') && item.scope === 'turn-local' && item.policy === 'observe-only'), 'task-local capture should not become persistent preference');
  const uncertaintyCapture = JSON.parse(run(['memory', 'capture-prompt', '--prompt', '영어로 하는 게 나을까? 추천해줘', '--source', 'manual', '--json']));
  assert(uncertaintyCapture.preferenceSignals.some((item) => item.scopeEvidence.includes('uncertainty-cue') && item.intent === 'meta-question' && item.policy === 'observe-only'), 'uncertainty capture should remain observe-only');
  const hookSuggestNoSignalBefore = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const hookSuggestNoSignal = JSON.parse(run(['memory', 'hook-suggest', '--prompt', 'PR 머지하고 다음 작업 진행해줘', '--source', 'codex', '--json']));
  assert(hookSuggestNoSignal.actionable === false && hookSuggestNoSignal.additionalContext === '', 'hook suggest no-signal should be silent');
  assert(hookSuggestNoSignal.safety.rawPromptIncluded === false && hookSuggestNoSignal.safety.preferencesMutated === false, 'hook suggest no-signal safety invalid');
  assert(await readFile(join(learnerDir, 'signals.jsonl'), 'utf8') === hookSuggestNoSignalBefore, 'hook suggest no-signal appended signals');
  const hookSuggestPreferencesBefore = await readFile(join(learnerDir, 'preferences.json'), 'utf8');
  const hookSuggest = JSON.parse(run(['memory', 'hook-suggest', '--prompt', '앞으로 한국어로 짧게 설명해줘', '--source', 'codex', '--json']));
  assert(hookSuggest.actionable === true && hookSuggest.additionalContext.includes('# Contextbook Hook Suggestion'), 'hook suggest should emit additional context');
  assert(hookSuggest.preferenceSignals.some((item) => item.dimension === 'language' && item.value === 'ko'), 'hook suggest missing language signal');
  assert(hookSuggest.recommendedActions.some((action) => action.command.includes('apply-preference-signals') && action.command.includes('--dry-run') && action.approvalRequired === true), 'hook suggest missing dry-run approval action');
  assert(!hookSuggest.additionalContext.includes('앞으로 한국어로 짧게 설명해줘'), 'hook suggest leaked raw prompt in context');
  assert(hookSuggest.safety.rawPromptIncluded === false && hookSuggest.safety.rawPromptPersisted === false && hookSuggest.safety.preferencesMutated === false, 'hook suggest safety invalid');
  assert(await readFile(join(learnerDir, 'preferences.json'), 'utf8') === hookSuggestPreferencesBefore, 'hook suggest mutated preferences');
  const hookSuggestMarkdown = run(['memory', 'hook-suggest', '--prompt', '앞으로 한국어로 짧게 설명해줘', '--source', 'manual']);
  assert(hookSuggestMarkdown.includes('# Contextbook Hook Suggestion') && hookSuggestMarkdown.includes('Suggested Next Actions'), 'hook suggest markdown missing sections');
  const hookMemoryContext = JSON.parse(run(['memory', 'hook-suggest', '--prompt', 'cleanup 왜 해야 돼?', '--source', 'codex', '--json']));
  assert(hookMemoryContext.actionable === true && hookMemoryContext.memoryContext.included === true && hookMemoryContext.memoryContext.trigger === 'learning-question', 'hook suggest should include memory context for learning questions');
  assert(hookMemoryContext.additionalContext.includes('## Read-only Memory Context'), 'hook memory context missing additional context section');
  assert(hookMemoryContext.memoryContext.projectConcepts.length >= 1, 'hook memory context missing project concepts');
  assert(!hookMemoryContext.additionalContext.includes('cleanup 왜 해야 돼?'), 'hook memory context leaked raw prompt');
  assert(hookMemoryContext.safety.preferencesMutated === false && hookMemoryContext.safety.projectMemoryMutated === false, 'hook memory context safety invalid');
  const forcedHookMemoryContext = JSON.parse(run(['memory', 'hook-suggest', '--prompt', '다음 작업 진행해줘', '--source', 'manual', '--include-memory-context', '--json']));
  assert(forcedHookMemoryContext.memoryContext.included === true && forcedHookMemoryContext.memoryContext.trigger === 'forced', 'forced hook memory context missing');
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
  assert(corePreferenceCandidates.some((item) => item.dimension === 'language' && item.value === 'ko' && item.scope && item.policy), 'core preference classifier missing language signal contract');

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
  assert(dryPreferenceApply.mode === 'auto-safe' && dryPreferenceApply.policyDecisions.some((item) => item.decision === 'auto_apply' && item.reasonCode === 'LOW_RISK_EXPLICIT_PREFERENCE'), 'preference apply dry-run missing auto-safe policy decision');
  assert(dryPreferenceApply.preferenceSignals.every((item) => item.policy === 'apply-eligible' || item.route !== 'auto-apply-safe'), 'explicit apply should mark safe signals apply-eligible');
  assert(dryPreferenceApply.preferenceSignals.some((item) => item.scope === 'persistent-explicit' && item.scopeEvidence.includes('explicit-apply-command')), 'explicit apply should include explicit apply evidence');
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
  const preferenceHistory = JSON.parse(run(['memory', 'preference-history', '--json']));
  const preferenceHistoryEntry = preferenceHistory.entries.find((entry) => entry.command === 'memory.apply-preference-signals' && entry.canUndo === true);
  assert(preferenceHistoryEntry?.backup?.startsWith('preferences.json.bak-'), 'preference history missing undoable apply-preference entry');
  assert(preferenceHistory.entries[0].index === 1 && preferenceHistory.eventCounts.undoableEntries >= 1, 'preference history indexes/counts invalid');
  const preferenceHistoryMarkdown = run(['memory', 'preference-history']);
  assert(preferenceHistoryMarkdown.includes('# Preference History') && preferenceHistoryMarkdown.includes('can undo'), 'preference history markdown missing content');
  assert(!JSON.stringify(preferenceHistory).includes(applyPreferencePrompt) && !JSON.stringify(preferenceHistory).includes(home), 'preference history leaked raw prompt or absolute path');
  const undoDryBeforePreferences = await readFile(join(learnerDir, 'preferences.json'), 'utf8');
  const undoDryAuditBefore = await readFile(join(learnerDir, 'profile-updates.jsonl'), 'utf8');
  const undoDryBackupCountBefore = (await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length;
  const undoDryRun = JSON.parse(run(['memory', 'undo-preference-update', '--entry', String(preferenceHistoryEntry.index), '--dry-run', '--json']));
  assert(undoDryRun.dryRun === true && undoDryRun.applied === false && undoDryRun.changes.some((change) => change.operation === 'restore-snapshot'), 'preference undo dry-run shape invalid');
  assert(await readFile(join(learnerDir, 'preferences.json'), 'utf8') === undoDryBeforePreferences, 'preference undo dry-run mutated preferences');
  assert(await readFile(join(learnerDir, 'profile-updates.jsonl'), 'utf8') === undoDryAuditBefore, 'preference undo dry-run appended audit');
  assert((await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length === undoDryBackupCountBefore, 'preference undo dry-run created backup');
  const undoApply = JSON.parse(run(['memory', 'undo-preference-update', '--entry', preferenceHistoryEntry.id, '--yes', '--json']));
  assert(undoApply.applied === true && undoApply.backupCreated?.startsWith('preferences.json.bak-'), 'preference undo apply did not restore with backup');
  assert(JSON.stringify(await readJson(join(learnerDir, 'preferences.json'))) === JSON.stringify(JSON.parse(preferenceApplyPreferencesBefore)), 'preference undo did not restore previous preferences snapshot');
  const undoAuditEvents = (await readJsonl(join(learnerDir, 'profile-updates.jsonl'))).filter((item) => item.command === 'memory.undo-preference-update');
  assert(undoAuditEvents.length === 1 && undoAuditEvents[0].metadata?.restoredBackup === preferenceHistoryEntry.backup, 'preference undo audit missing restored backup');
  assert(!JSON.stringify(undoAuditEvents).includes(applyPreferencePrompt), 'preference undo audit persisted raw prompt');
  assert((await readdir(learnerDir)).filter((entry) => entry.startsWith('preferences.json.bak-')).length === preferenceApplyBackupsBefore.length + 2, 'preference undo apply did not create exactly one additional backup');
  const undoAgain = JSON.parse(run(['memory', 'undo-preference-update', '--entry', preferenceHistoryEntry.id, '--yes', '--json']));
  assert(undoAgain.applied === false && undoAgain.changes.every((change) => change.operation === 'skip-identical'), 'preference undo identical should no-op');
  assert((await readJsonl(join(learnerDir, 'profile-updates.jsonl'))).filter((item) => item.command === 'memory.undo-preference-update').length === 1, 'preference undo identical appended audit');
  const preferenceRecover = JSON.parse(run(['memory', 'recover', '--json']));
  assert(preferenceRecover.findings.some((finding) => finding.code === 'preference-undo-candidates-found'), 'memory recover should surface undoable preference history');
  assert(preferenceRecover.recommendedFlow.some((step) => step.command === 'contextbook memory preference-history'), 'memory recover missing preference-history recommendation');
  assert(preferenceRecover.recommendedFlow.some((step) => step.command.includes('undo-preference-update') && step.command.includes('--dry-run')), 'memory recover missing preference undo dry-run recommendation');
  const selfAssessmentPreference = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', '나는 CS를 못해서 그런가 이해가 잘 안 돼. 앞으로 쉽게 설명해줘.', '--dry-run', '--json']));
  assert(selfAssessmentPreference.preferenceSignals.some((item) => item.dimension === 'self-assessment'), 'preference apply self-assessment missing signal');
  assert(selfAssessmentPreference.preferenceSignals.some((item) => item.dimension === 'self-assessment' && item.policy === 'observe-only' && item.risk === 'high'), 'preference apply self-assessment should remain observe-only high risk');
  assert(selfAssessmentPreference.policyDecisions.some((item) => item.dimension === 'self-assessment' && item.decision === 'reject' && item.reasonCode === 'UNSAFE_USER_JUDGMENT'), 'preference apply self-assessment missing reject policy decision');
  assert(selfAssessmentPreference.changes.some((change) => change.signal?.dimension === 'self-assessment' && change.operation === 'skip-unsafe-route'), 'preference apply self-assessment was not skipped');
  const taskLocalApply = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', '이번 답변만 내 프로젝트 기준으로 설명해줘.', '--json']));
  assert(taskLocalApply.applied === false && taskLocalApply.policyDecisions.some((item) => item.decision === 'suggest' && item.reasonCode === 'TURN_LOCAL_OR_OBSERVE_ONLY'), 'task-local preference apply should stay suggestion-only');
  const suggestModePreference = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', '앞으로 한국어로 설명해줘.', '--mode', 'suggest', '--json']));
  assert(suggestModePreference.applied === false && suggestModePreference.policyDecisions.some((item) => item.decision === 'suggest'), 'suggest mode should not mutate preferences');
  const taskOnlyPreference = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', 'PR 머지하고 다음 작업 진행해줘.', '--json']));
  assert(taskOnlyPreference.applied === false && taskOnlyPreference.preferenceSignals.length === 0 && taskOnlyPreference.changes.length === 0, 'task-only preference apply should no-op');
  const claudePreference = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', '영어로 간결하게 설명해줘.', '--source', 'claude-code', '--dry-run', '--json']));
  assert(claudePreference.source === 'claude-code' && claudePreference.preferenceSignals.some((item) => item.dimension === 'language' && item.value === 'en'), 'preference apply did not accept claude-code source');
  const badPreferenceSource = runExpectFail(['memory', 'apply-preference-signals', '--prompt', '한국어로 설명해줘', '--source', 'bad']);
  assert(badPreferenceSource.includes('Usage: contextbook memory apply-preference-signals'), 'preference apply invalid source missing usage');
  const preferenceApplyMarkdown = run(['memory', 'apply-preference-signals', '--prompt', '한국어로 쉽게 설명해줘', '--dry-run']);
  assert(preferenceApplyMarkdown.includes('# Apply Preference Signals') && preferenceApplyMarkdown.includes('## Preference Signals') && preferenceApplyMarkdown.includes('## Policy Decisions') && preferenceApplyMarkdown.includes('## Changes') && preferenceApplyMarkdown.includes('## Safety'), 'preference apply markdown missing sections');
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
  assert(memoryContext.freshness.workingTreeChanged === false && memoryContext.freshness.changedFilesSinceScan === 0, 'memory context should be fresh immediately after scan');
  assert(!memoryContext.freshness.staleHints.some((hint) => hint.code === 'working-tree-changed'), 'memory context should not report working tree stale immediately after scan');
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
  const validateSignalsBefore = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const validateEvidenceBefore = await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8');
  const memoryValidate = JSON.parse(run(['memory', 'validate', '--json']));
  assert(memoryValidate.schemaVersion === 1 && memoryValidate.status === 'ok', 'memory validate after setup should pass');
  assert(memoryValidate.summary.projectFilesChecked >= 5 && memoryValidate.summary.learnerFilesChecked >= 6, 'memory validate summary counts invalid');
  assert(memoryValidate.safety.rawContentIncluded === false && memoryValidate.safety.absolutePathsIncluded === false, 'memory validate safety flags invalid');
  assert(!JSON.stringify(memoryValidate).includes(root) && !JSON.stringify(memoryValidate).includes(home), 'memory validate leaked absolute local path');
  const memoryValidateMarkdown = run(['memory', 'validate']);
  assert(memoryValidateMarkdown.includes('# Contextbook Memory Validate') && memoryValidateMarkdown.includes('## Safety'), 'memory validate markdown missing sections');
  const coreMemoryValidate = await core.validateMemory({ root, learner: 'default' });
  assert(coreMemoryValidate.schemaVersion === 1 && coreMemoryValidate.status === 'ok', 'core memory validate contract invalid');
  const memoryRepair = JSON.parse(run(['memory', 'repair', '--dry-run', '--json']));
  assert(memoryRepair.schemaVersion === 1 && memoryRepair.dryRun === true && memoryRepair.status === 'ok', 'memory repair dry-run after setup should pass');
  assert(memoryRepair.summary.operations === 0 && memoryRepair.safety.backupCreated === false, 'memory repair dry-run healthy summary/safety invalid');
  const memoryRepairMarkdown = run(['memory', 'repair', '--dry-run']);
  assert(memoryRepairMarkdown.includes('# Contextbook Memory Repair Dry Run') && memoryRepairMarkdown.includes('## Safety'), 'memory repair dry-run markdown missing sections');
  const memoryRepairNoop = JSON.parse(run(['memory', 'repair', '--yes', '--json']));
  assert(memoryRepairNoop.dryRun === false && memoryRepairNoop.repairApplied === true && memoryRepairNoop.applied.written === 0 && !memoryRepairNoop.preRepairBackupId, 'memory repair --yes healthy no-op should not create backup');
  assert(memoryRepairNoop.safety.preRepairBackupCreated === false && memoryRepairNoop.safety.projectMemoryMutated === false && memoryRepairNoop.postValidationStatus === 'ok', 'memory repair --yes healthy no-op safety invalid');
  const learnerAnswersPath = join(learnerDir, 'answers.jsonl');
  const learnerAnswersBeforeSymlink = await readFile(learnerAnswersPath, 'utf8');
  const outsideRepairTarget = join(root, 'outside-repair-target.jsonl');
  await rm(learnerAnswersPath);
  await symlink(outsideRepairTarget, learnerAnswersPath);
  const repairSymlinkError = runExpectFail(['memory', 'repair', '--yes']);
  assert(repairSymlinkError.includes('Cannot apply memory repair while the repair plan is blocked') || repairSymlinkError.includes('Cannot apply memory repair for ~/.contextbook/learners/default/answers.jsonl') || repairSymlinkError.includes('Cannot create pre-repair backup safely'), 'memory repair --yes should sanitize symlink repair errors');
  assert(!existsSync(outsideRepairTarget), 'memory repair --yes created external symlink target');
  await rm(learnerAnswersPath);
  await writeFile(learnerAnswersPath, learnerAnswersBeforeSymlink, 'utf8');
  const learnerProfilePath = join(learnerDir, 'profile.md');
  const learnerProfileBeforeSymlink = await readFile(learnerProfilePath, 'utf8');
  const outsideBackupSource = join(root, 'outside-backup-source.md');
  await writeFile(outsideBackupSource, 'outside profile content\n', 'utf8');
  await rm(learnerProfilePath);
  await symlink(outsideBackupSource, learnerProfilePath);
  const backupSourceSymlink = JSON.parse(run(['memory', 'backup', '--dry-run', '--json']));
  assert(backupSourceSymlink.status === 'warning' && backupSourceSymlink.manifest.items.some((item) => item.key === 'learner.profile' && item.status === 'inspect-error' && item.inspectErrorCode === 'UNSAFE_BACKUP_SOURCE_SYMLINK'), 'memory backup dry-run should block symlinked backup sources');
  await rm(learnerAnswersPath);
  const repairBackupSourceSymlinkError = runExpectFail(['memory', 'repair', '--yes']);
  assert(repairBackupSourceSymlinkError.includes('Cannot apply memory repair while the repair plan is blocked') || repairBackupSourceSymlinkError.includes('Cannot create pre-repair backup safely'), 'memory repair --yes should reject symlinked backup sources');
  assert(await readFile(outsideBackupSource, 'utf8') === 'outside profile content\n', 'memory repair --yes mutated external backup source');
  await rm(learnerProfilePath);
  await writeFile(learnerProfilePath, learnerProfileBeforeSymlink, 'utf8');
  await writeFile(learnerAnswersPath, learnerAnswersBeforeSymlink, 'utf8');
  const learnerRootPath = join(learnerDir);
  const learnerRootExternal = join(root, 'outside-learner-root');
  await rm(learnerRootPath, { recursive: true, force: true });
  await mkdir(learnerRootExternal, { recursive: true });
  await writeFile(join(learnerRootExternal, 'profile.md'), 'external profile\n', 'utf8');
  await symlink(learnerRootExternal, learnerRootPath);
  const backupParentSymlink = JSON.parse(run(['memory', 'backup', '--dry-run', '--json']));
  assert(backupParentSymlink.status === 'warning' && backupParentSymlink.manifest.items.some((item) => item.scope === 'learner' && item.status === 'inspect-error' && item.inspectErrorCode === 'UNSAFE_BACKUP_SOURCE_PATH'), 'memory backup dry-run should block symlinked learner roots');
  const repairParentSymlinkError = runExpectFail(['memory', 'repair', '--yes']);
  assert(repairParentSymlinkError.includes('Cannot apply memory repair for ~/.contextbook/learners/default/profile.md') || repairParentSymlinkError.includes('Cannot create pre-repair backup safely') || repairParentSymlinkError.includes('Cannot apply memory repair while the repair plan is blocked'), 'memory repair --yes should sanitize parent symlink repair errors');
  assert(!existsSync(join(learnerRootExternal, 'answers.jsonl')), 'memory repair --yes wrote through learner root symlink');
  await rm(learnerRootPath);
  await mkdir(learnerRootPath, { recursive: true });
  await writeFile(learnerAnswersPath, learnerAnswersBeforeSymlink, 'utf8');
  await writeFile(join(learnerDir, 'profile.md'), '# Learner Profile\n', 'utf8');
  await writeFile(join(learnerDir, 'preferences.json'), JSON.stringify({ explanationOrder: ['project'], avoid: [] }, null, 2) + '\n', 'utf8');
  await writeFile(join(learnerDir, 'weak-terms.json'), '{}\n', 'utf8');
  await writeFile(join(learnerDir, 'signals.jsonl'), validateSignalsBefore, 'utf8');
  await writeFile(join(learnerDir, 'profile-updates.jsonl'), profileUpdatesAfterApply.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  const coreMemoryRepair = await core.planMemoryRepair({ root, learner: 'default' });
  assert(coreMemoryRepair.schemaVersion === 1 && coreMemoryRepair.status === 'ok', 'core memory repair contract invalid');
  const memoryRebuild = JSON.parse(run(['memory', 'rebuild', '--dry-run', '--json']));
  assert(memoryRebuild.schemaVersion === 1 && memoryRebuild.dryRun === true && memoryRebuild.status === 'warning', 'memory rebuild dry-run after setup should warn about planned writes');
  assert(memoryRebuild.preview.conceptsDetected >= 1 && memoryRebuild.preview.evidenceDetected >= 1, 'memory rebuild dry-run preview counts invalid');
  assert(memoryRebuild.summary.wouldWrite >= 4 && memoryRebuild.operations.some((operation) => operation.operation === 'preserve-learner-memory'), 'memory rebuild dry-run operations invalid');
  const memoryRebuildMarkdown = run(['memory', 'rebuild', '--dry-run']);
  assert(memoryRebuildMarkdown.includes('# Contextbook Memory Rebuild Dry Run') && memoryRebuildMarkdown.includes('## Safety'), 'memory rebuild dry-run markdown missing sections');
  const coreMemoryRebuild = await core.planMemoryRebuild({ root, learner: 'default' });
  assert(coreMemoryRebuild.schemaVersion === 1 && coreMemoryRebuild.preview.conceptsDetected >= 1, 'core memory rebuild contract invalid');
  const rebuildConceptsBeforeApply = await readFile(join(root, '.contextbook', 'project', 'concepts.json'), 'utf8');
  const rebuildSignalsBeforeApply = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const rebuildProfileBeforeApply = await readFile(join(learnerDir, 'profile.md'), 'utf8');
  await writeFile(join(root, '.contextbook', 'project', 'concepts.json'), '[]\n', 'utf8');
  const memoryRebuildApply = JSON.parse(run(['memory', 'rebuild', '--yes', '--json']));
  assert(memoryRebuildApply.schemaVersion === 1 && memoryRebuildApply.dryRun === false && memoryRebuildApply.rebuildApplied === true, 'memory rebuild --yes json contract invalid');
  assert(memoryRebuildApply.preRebuildBackupId && memoryRebuildApply.safety.preRebuildBackupCreated === true, 'memory rebuild --yes should create pre-rebuild backup');
  assert(memoryRebuildApply.postValidationStatus === 'ok' && memoryRebuildApply.applied.concepts >= 1 && memoryRebuildApply.applied.evidence >= 1, 'memory rebuild --yes did not rescan project memory');
  assert(memoryRebuildApply.safety.projectMemoryMutated === true && memoryRebuildApply.safety.learnerMemoryMutated === false && memoryRebuildApply.safety.conversationMemoryMutated === false, 'memory rebuild --yes safety flags invalid');
  assert(await readFile(join(learnerDir, 'signals.jsonl'), 'utf8') === rebuildSignalsBeforeApply, 'memory rebuild --yes mutated conversation signals');
  assert(await readFile(join(learnerDir, 'profile.md'), 'utf8') === rebuildProfileBeforeApply, 'memory rebuild --yes mutated learner profile');
  assert((await readFile(join(root, '.contextbook', 'project', 'concepts.json'), 'utf8')) !== '[]\n', 'memory rebuild --yes did not replace project concepts');
  assert(existsSync(join(root, '.contextbook', 'backups', memoryRebuildApply.preRebuildBackupId, 'manifest.json')), 'memory rebuild --yes did not create project pre-rebuild manifest');
  assert(existsSync(join(home, '.contextbook', 'backups', memoryRebuildApply.preRebuildBackupId, 'manifest.json')), 'memory rebuild --yes did not create learner pre-rebuild manifest');
  assert(!JSON.stringify(memoryRebuildApply).includes(root) && !JSON.stringify(memoryRebuildApply).includes(home), 'memory rebuild --yes leaked absolute path');
  const memoryRebuildApplyMarkdown = run(['memory', 'rebuild', '--yes']);
  assert(memoryRebuildApplyMarkdown.includes('# Contextbook Memory Rebuild') && memoryRebuildApplyMarkdown.includes('rebuild applied: yes'), 'memory rebuild --yes markdown missing apply sections');
  assert(runExpectFail(['memory', 'rebuild', '--dry-run', '--yes']).includes('Usage: contextbook memory rebuild (--dry-run|--yes) [--json]'), 'memory rebuild dry-run plus yes should fail');
  await writeFile(join(root, '.contextbook', 'project', 'concepts.json'), rebuildConceptsBeforeApply, 'utf8');
  const memoryBackup = JSON.parse(run(['memory', 'backup', '--dry-run', '--json']));
  assert(memoryBackup.schemaVersion === 1 && memoryBackup.dryRun === true && memoryBackup.status === 'ok', 'memory backup dry-run after setup should pass');
  assert(memoryBackup.summary.included >= 11 && memoryBackup.summary.missing === 0 && memoryBackup.summary.inspectErrors === 0, 'memory backup dry-run after setup summary invalid');
  assert(memoryBackup.manifest.target.startsWith('.contextbook/backups/backup-'), 'memory backup dry-run target should be safe relative backup manifest path');
  assert(memoryBackup.manifest.items.some((item) => item.key === 'project.evidence' && item.file === '.contextbook/project/evidence.jsonl' && item.backupPath === 'project/evidence.jsonl' && item.include === true), 'memory backup dry-run missing project evidence item');
  assert(memoryBackup.manifest.items.some((item) => item.key === 'learner.signals' && item.file === '~/.contextbook/learners/default/signals.jsonl' && item.backupPath === 'learners/default/signals.jsonl' && item.include === true), 'memory backup dry-run missing learner signals item');
  assert(memoryBackup.health.validationIncluded === false && memoryBackup.health.statusMeaning === 'backup-preview-only', 'memory backup dry-run health contract invalid');
  assert(memoryBackup.safety.backupCreated === false && memoryBackup.safety.rawContentIncluded === false && memoryBackup.safety.absolutePathsIncluded === false, 'memory backup dry-run safety invalid after setup');
  assert(!JSON.stringify(memoryBackup).includes(root) && !JSON.stringify(memoryBackup).includes(home), 'memory backup dry-run leaked absolute local path');
  const memoryBackupMarkdown = run(['memory', 'backup', '--dry-run']);
  assert(memoryBackupMarkdown.includes('# Contextbook Memory Backup Dry Run') && memoryBackupMarkdown.includes('## Safety'), 'memory backup dry-run markdown missing sections');
  const secondMemoryBackup = JSON.parse(run(['memory', 'backup', '--dry-run', '--json']));
  assert(secondMemoryBackup.manifest.backupId !== memoryBackup.manifest.backupId, 'memory backup dry-run backup ids should not collide for consecutive runs');
  const coreMemoryBackup = await core.planMemoryBackup({ root, learner: 'default' });
  assert(coreMemoryBackup.schemaVersion === 1 && coreMemoryBackup.summary.included >= 11, 'core memory backup contract invalid');
  const coreMemoryRecover = await core.recoverMemory({ root, learner: 'default' });
  assert(coreMemoryRecover.schemaVersion === 1 && coreMemoryRecover.safety.readOnly === true, 'core memory recover contract invalid');
  const memoryBackupApply = JSON.parse(run(['memory', 'backup', '--yes', '--json']));
  assert(memoryBackupApply.schemaVersion === 1 && memoryBackupApply.dryRun === false && memoryBackupApply.safety.backupCreated === true, 'memory backup --yes json contract invalid');
  assert(memoryBackupApply.targets.projectManifest.startsWith('.contextbook/backups/backup-'), 'memory backup --yes missing project manifest target');
  assert(memoryBackupApply.targets.learnerManifest.startsWith('~/.contextbook/backups/backup-'), 'memory backup --yes missing learner manifest target');
  assert(memoryBackupApply.manifest.items.every((item) => item.status !== 'included' || typeof item.sha256 === 'string'), 'memory backup --yes missing item checksums');
  const backupId = memoryBackupApply.manifest.backupId;
  const projectBackupManifestPath = join(root, '.contextbook', 'backups', backupId, 'manifest.json');
  const learnerBackupManifestPath = join(home, '.contextbook', 'backups', backupId, 'manifest.json');
  assert(existsSync(projectBackupManifestPath), 'memory backup --yes did not create project manifest');
  assert(existsSync(learnerBackupManifestPath), 'memory backup --yes did not create learner manifest');
  const projectBackupManifest = await readJson(projectBackupManifestPath);
  const learnerBackupManifest = await readJson(learnerBackupManifestPath);
  assert(projectBackupManifest.scope === 'project' && projectBackupManifest.safety.containsLearnerMemory === false, 'project backup manifest scope/safety invalid');
  assert(learnerBackupManifest.scope === 'learner' && learnerBackupManifest.safety.storedOutsideProject === true, 'learner backup manifest scope/safety invalid');
  assert(learnerBackupManifest.items.some((item) => item.key === 'learner.weakTerms' && item.backupPath === 'learners/default/weak-terms.json'), 'learner backup should preserve weak-terms filename');
  assert(learnerBackupManifest.items.some((item) => item.key === 'learner.profileUpdates' && item.backupPath === 'learners/default/profile-updates.jsonl'), 'learner backup should preserve profile-updates filename');
  assert(projectBackupManifest.items.every((item) => item.scope === 'project'), 'project backup manifest contains non-project item');
  assert(learnerBackupManifest.items.every((item) => item.scope === 'learner'), 'learner backup manifest contains non-learner item');
  assert(existsSync(join(root, '.contextbook', 'backups', backupId, 'project', 'evidence.jsonl')), 'project evidence backup file missing');
  assert(!existsSync(join(root, '.contextbook', 'backups', backupId, 'learners')), 'learner memory was copied into project backup root');
  assert(existsSync(join(home, '.contextbook', 'backups', backupId, 'learners', 'default', 'signals.jsonl')), 'learner signals backup file missing from user backup root');
  const backupOutputText = `${JSON.stringify(memoryBackupApply)}\n${JSON.stringify(projectBackupManifest)}\n${JSON.stringify(learnerBackupManifest)}`;
  assert(!backupOutputText.includes(root) && !backupOutputText.includes(home), 'memory backup --yes leaked absolute path');
  assert(!backupOutputText.includes('should-not-leak') && !backupOutputText.includes('SECRET_TOKEN'), 'memory backup --yes manifest leaked raw memory content');
  assert(runExpectFail(['memory', 'backup', '--dry-run', '--yes']).includes('Usage: contextbook memory backup (--dry-run|--yes) [--json]'), 'memory backup dry-run plus yes should fail');
  const memoryRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--json']));
  assert(memoryRestore.schemaVersion === 1 && memoryRestore.dryRun === true && memoryRestore.status === 'ok', 'memory restore dry-run after backup should be ok');
  assert(memoryRestore.summary.identical >= 11 && memoryRestore.summary.wouldWrite === 0 && memoryRestore.summary.blocked === 0, 'memory restore dry-run identical summary invalid');
  assert(memoryRestore.operations.some((operation) => operation.key === 'project.evidence' && operation.operation === 'skip-identical'), 'memory restore dry-run missing project evidence identical operation');
  assert(memoryRestore.operations.some((operation) => operation.key === 'learner.signals' && operation.operation === 'skip-identical'), 'memory restore dry-run missing learner signals identical operation');
  assert(memoryRestore.safety.restoreApplied === false && memoryRestore.safety.rawContentIncluded === false && memoryRestore.safety.absolutePathsIncluded === false, 'memory restore dry-run safety invalid');
  assert(!JSON.stringify(memoryRestore).includes(root) && !JSON.stringify(memoryRestore).includes(home), 'memory restore dry-run leaked absolute path');
  const conceptsForRestore = await readFile(join(root, '.contextbook', 'project', 'concepts.json'), 'utf8');
  await writeFile(join(root, '.contextbook', 'project', 'concepts.json'), '[]\n', 'utf8');
  const changedMemoryRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--json']));
  assert(changedMemoryRestore.status === 'warning' && changedMemoryRestore.operations.some((operation) => operation.key === 'project.concepts' && operation.operation === 'restore-file' && operation.wouldWrite === true), 'memory restore dry-run should preview changed project concepts restore');
  const appliedMemoryRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--yes', '--json']));
  assert(appliedMemoryRestore.schemaVersion === 1 && appliedMemoryRestore.dryRun === false && appliedMemoryRestore.restoreApplied === true, 'memory restore --yes json contract invalid');
  assert(appliedMemoryRestore.preRestoreBackupId && appliedMemoryRestore.preRestoreBackupId !== backupId, 'memory restore --yes should create distinct pre-restore backup');
  assert(appliedMemoryRestore.applied.written >= 1 && appliedMemoryRestore.applied.blocked === 0, 'memory restore --yes applied summary invalid');
  assert(appliedMemoryRestore.safety.preRestoreBackupCreated === true && appliedMemoryRestore.safety.restoreApplied === true && appliedMemoryRestore.safety.rawContentIncluded === false && appliedMemoryRestore.safety.absolutePathsIncluded === false, 'memory restore --yes safety invalid');
  assert(await readFile(join(root, '.contextbook', 'project', 'concepts.json'), 'utf8') === conceptsForRestore, 'memory restore --yes did not restore project concepts');
  assert(existsSync(join(root, '.contextbook', 'backups', appliedMemoryRestore.preRestoreBackupId, 'manifest.json')), 'memory restore --yes did not create project pre-restore manifest');
  assert(existsSync(join(home, '.contextbook', 'backups', appliedMemoryRestore.preRestoreBackupId, 'manifest.json')), 'memory restore --yes did not create learner pre-restore manifest');
  assert(!JSON.stringify(appliedMemoryRestore).includes(root) && !JSON.stringify(appliedMemoryRestore).includes(home), 'memory restore --yes leaked absolute path');
  const projectConceptsPath = join(root, '.contextbook', 'project', 'concepts.json');
  const externalConceptsPath = join(root, 'outside-concepts.json');
  await writeFile(externalConceptsPath, 'outside-concepts\n', 'utf8');
  await rm(projectConceptsPath);
  await symlink(externalConceptsPath, projectConceptsPath);
  const symlinkDestinationRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--json']));
  assert(symlinkDestinationRestore.status === 'blocked' && symlinkDestinationRestore.operations.some((operation) => operation.key === 'project.concepts' && operation.code === 'unsafe-destination-path'), 'memory restore dry-run should block symlink destinations');
  assert(runExpectFail(['memory', 'restore', '--backup-id', backupId, '--yes']).includes('Cannot apply memory restore while the restore plan is blocked'), 'memory restore --yes should reject symlink destination plans');
  assert(await readFile(externalConceptsPath, 'utf8') === 'outside-concepts\n', 'memory restore symlink destination mutated external file');
  await rm(projectConceptsPath);
  await writeFile(projectConceptsPath, conceptsForRestore, 'utf8');
  const learnerBackupManifestBeforeMissing = await readFile(learnerBackupManifestPath, 'utf8');
  await writeFile(join(root, '.contextbook', 'project', 'concepts.json'), '[]\n', 'utf8');
  await rm(learnerBackupManifestPath);
  const missingManifestApplyError = runExpectFail(['memory', 'restore', '--backup-id', backupId, '--yes']);
  assert(missingManifestApplyError.includes('Cannot apply memory restore while a split backup manifest is missing'), 'memory restore --yes should reject incomplete split backups');
  assert(await readFile(join(root, '.contextbook', 'project', 'concepts.json'), 'utf8') === '[]\n', 'memory restore --yes with missing split manifest mutated project concepts');
  await writeFile(learnerBackupManifestPath, learnerBackupManifestBeforeMissing, 'utf8');
  await rm(join(root, '.contextbook', 'project', 'concepts.json'));
  await mkdir(join(root, '.contextbook', 'project', 'concepts.json'));
  const restoreApplyWriteError = runExpectFail(['memory', 'restore', '--backup-id', backupId, '--yes']);
  assert((restoreApplyWriteError.includes('Cannot apply memory restore for .contextbook/project/concepts.json') || restoreApplyWriteError.includes('Cannot create pre-restore backup safely')) && !restoreApplyWriteError.includes(root) && !restoreApplyWriteError.includes(home), 'memory restore --yes should sanitize apply fs errors');
  await rm(join(root, '.contextbook', 'project', 'concepts.json'), { recursive: true });
  await writeFile(join(root, '.contextbook', 'project', 'concepts.json'), conceptsForRestore, 'utf8');
  const backupEvidencePath = join(root, '.contextbook', 'backups', backupId, 'project', 'evidence.jsonl');
  const backupEvidenceBeforeCorrupt = await readFile(backupEvidencePath, 'utf8');
  await writeFile(backupEvidencePath, 'RESTORE-SHOULD-NOT-LEAK', 'utf8');
  const corruptMemoryRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--json']));
  assert(corruptMemoryRestore.status === 'blocked' && corruptMemoryRestore.operations.some((operation) => operation.key === 'project.evidence' && operation.code === 'backup-checksum-mismatch'), 'memory restore dry-run should block corrupted backup file');
  assert(!JSON.stringify(corruptMemoryRestore).includes('RESTORE-SHOULD-NOT-LEAK'), 'memory restore dry-run leaked corrupted backup content');
  const evidenceBeforeBlockedRestore = await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8');
  assert(runExpectFail(['memory', 'restore', '--backup-id', backupId, '--yes']).includes('Cannot apply memory restore while the restore plan is blocked'), 'memory restore --yes should reject blocked plans');
  assert(await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8') === evidenceBeforeBlockedRestore, 'blocked memory restore --yes mutated project evidence');
  await writeFile(backupEvidencePath, backupEvidenceBeforeCorrupt, 'utf8');
  const backupConceptsPath = join(root, '.contextbook', 'backups', backupId, 'project', 'concepts.json');
  const backupConceptsBeforeSymlink = await readFile(backupConceptsPath, 'utf8');
  await writeFile(externalConceptsPath, 'outside-backup\n', 'utf8');
  await rm(backupConceptsPath);
  await symlink(externalConceptsPath, backupConceptsPath);
  const symlinkBackupRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--json']));
  assert(symlinkBackupRestore.status === 'blocked' && symlinkBackupRestore.operations.some((operation) => operation.key === 'project.concepts' && operation.code === 'unsafe-backup-file'), 'memory restore dry-run should block symlink backup files');
  assert(runExpectFail(['memory', 'restore', '--backup-id', backupId, '--yes']).includes('Cannot apply memory restore while the restore plan is blocked'), 'memory restore --yes should reject symlink backup plans');
  await rm(backupConceptsPath);
  await writeFile(backupConceptsPath, backupConceptsBeforeSymlink, 'utf8');
  const tamperedProjectBackupManifest = structuredClone(projectBackupManifest);
  tamperedProjectBackupManifest.items = tamperedProjectBackupManifest.items.map((item) => item.key === 'project.concepts' ? { ...item, backupPath: 'project/evidence.jsonl' } : item);
  await writeFile(projectBackupManifestPath, JSON.stringify(tamperedProjectBackupManifest, null, 2), 'utf8');
  const tamperedManifestRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--json']));
  assert(tamperedManifestRestore.status === 'blocked' && tamperedManifestRestore.operations.some((operation) => operation.key === 'project.concepts' && operation.code === 'backup-path-mismatch'), 'memory restore dry-run should block canonical backup path mismatches');
  await writeFile(projectBackupManifestPath, JSON.stringify(projectBackupManifest, null, 2), 'utf8');
  const malformedProjectBackupManifest = structuredClone(projectBackupManifest);
  malformedProjectBackupManifest.items = malformedProjectBackupManifest.items.map((item) => item.key === 'project.config' ? { ...item, backupPath: undefined } : item);
  await writeFile(projectBackupManifestPath, JSON.stringify(malformedProjectBackupManifest, null, 2), 'utf8');
  const malformedManifestRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--json']));
  assert(malformedManifestRestore.status === 'blocked' && malformedManifestRestore.operations.some((operation) => operation.key === '<unknown-memory-key>' && operation.code === 'unsafe-backup-path'), 'memory restore dry-run should block malformed manifest items without crashing');
  const leakingProjectBackupManifest = structuredClone(projectBackupManifest);
  leakingProjectBackupManifest.items = leakingProjectBackupManifest.items.map((item) => item.key === 'project.config' ? { ...item, key: '/ABSOLUTE/LEAK/KEY' } : item);
  await writeFile(projectBackupManifestPath, JSON.stringify(leakingProjectBackupManifest, null, 2), 'utf8');
  const leakingManifestRestore = JSON.parse(run(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--json']));
  assert(leakingManifestRestore.status === 'blocked' && leakingManifestRestore.operations.some((operation) => operation.key === '<unknown-memory-key>' && operation.code === 'unsafe-manifest-item'), 'memory restore dry-run should sanitize unknown manifest keys');
  assert(!JSON.stringify(leakingManifestRestore).includes('/ABSOLUTE/LEAK/KEY'), 'memory restore dry-run leaked malformed manifest key');
  await writeFile(projectBackupManifestPath, JSON.stringify(projectBackupManifest, null, 2), 'utf8');
  assert(runExpectFail(['memory', 'restore', '--backup-id', backupId]).includes('Usage: contextbook memory restore --backup-id <id> (--dry-run|--yes) [--json]'), 'memory restore without mode should fail');
  assert(runExpectFail(['memory', 'restore', '--dry-run']).includes('Usage: contextbook memory restore --backup-id <id> (--dry-run|--yes) [--json]'), 'memory restore without backup id should fail');
  assert(runExpectFail(['memory', 'restore', '--backup-id', backupId, '--dry-run', '--yes']).includes('Usage: contextbook memory restore --backup-id <id> (--dry-run|--yes) [--json]'), 'memory restore dry-run plus yes should fail');
  assert(runExpectFail(['memory', 'restore', '--backup-id', '../../project', '--dry-run']).includes('Usage: contextbook memory restore --backup-id <id> (--dry-run|--yes) [--json]'), 'memory restore should reject backup id traversal');
  const projectMemoryRoot = join(root, '.contextbook', 'project');
  const outsideRebuildRoot = join(root, 'outside-rebuild-project');
  await rm(projectMemoryRoot, { recursive: true, force: true });
  await mkdir(outsideRebuildRoot, { recursive: true });
  await symlink(outsideRebuildRoot, projectMemoryRoot);
  const rebuildRootSymlinkError = runExpectFail(['memory', 'rebuild', '--yes']);
  assert(rebuildRootSymlinkError.includes('Cannot create pre-rebuild backup safely') || rebuildRootSymlinkError.includes('Cannot apply memory rebuild safely'), 'memory rebuild --yes should reject symlinked project memory roots');
  assert(!existsSync(join(outsideRebuildRoot, 'concepts.json')), 'memory rebuild --yes wrote through project root symlink');
  await rm(projectMemoryRoot);
  await mkdir(projectMemoryRoot, { recursive: true });
  run(['memory', 'rebuild', '--yes', '--json']);
  const invalidBackupIdRestore = await core.planMemoryRestore({ root, learner: 'default', backupId: '../../project' });
  assert(invalidBackupIdRestore.status === 'blocked' && invalidBackupIdRestore.operations.some((operation) => operation.code === 'invalid-backup-id') && !JSON.stringify(invalidBackupIdRestore).includes('../'), 'core memory restore should block invalid backup ids before path construction');
  assert(await readFile(join(learnerDir, 'signals.jsonl'), 'utf8') === validateSignalsBefore, 'memory validate/repair/rebuild/backup mutated learner signals');
  assert((await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8')).includes('useWorkflowSSE'), 'memory rebuild should leave regenerated project evidence readable');
  let inspectedPermissionError = false;
  await chmod(join(root, '.contextbook', 'project'), 0o000);
  try {
    const permissionBackup = await core.planMemoryBackup({ root, learner: 'default' });
    inspectedPermissionError = permissionBackup.status === 'warning' && permissionBackup.summary.inspectErrors > 0 && permissionBackup.summary.missing < permissionBackup.manifest.items.filter((item) => item.exists === false).length && permissionBackup.manifest.items.some((item) => item.scope === 'project' && item.status === 'inspect-error' && item.inspectErrorCode && item.inspectErrorCode !== 'ENOENT');
    const permissionBackupMarkdown = core.formatMemoryBackupSummary(permissionBackup);
    const permissionValidate = await core.validateMemory({ root, learner: 'default' });
    const permissionRebuild = await core.planMemoryRebuild({ root, learner: 'default' });
    inspectedPermissionError = inspectedPermissionError && permissionBackupMarkdown.includes('inspect-error: .contextbook/project/') && permissionValidate.status === 'error' && permissionValidate.issues.some((issue) => issue.code === 'inspect-error' && issue.file.startsWith('.contextbook/project/')) && permissionRebuild.status === 'blocked';
  } finally {
    await chmod(join(root, '.contextbook', 'project'), 0o755);
  }
  assert(inspectedPermissionError, 'memory backup dry-run should report non-ENOENT stat errors separately from missing-file');
  const conceptsBeforeCorrupt = await readFile(join(root, '.contextbook', 'project', 'concepts.json'), 'utf8');
  await writeFile(join(root, '.contextbook', 'project', 'concepts.json'), '{ invalid json', 'utf8');
  const invalidConceptsValidate = JSON.parse(run(['memory', 'validate', '--json']));
  assert(invalidConceptsValidate.status === 'error' && invalidConceptsValidate.issues.some((issue) => issue.file === '.contextbook/project/concepts.json' && issue.code === 'invalid-json'), 'memory validate did not catch invalid project json');
  assert(runExpectFail(['memory', 'repair', '--yes']).includes('Cannot apply memory repair while the repair plan is blocked'), 'memory repair --yes should reject malformed memory files');
  assert(await readFile(join(root, '.contextbook', 'project', 'concepts.json'), 'utf8') === '{ invalid json', 'memory repair --yes overwrote malformed concepts');
  const invalidConceptsRepair = JSON.parse(run(['memory', 'repair', '--dry-run', '--json']));
  assert(invalidConceptsRepair.status === 'blocked' && invalidConceptsRepair.operations.some((operation) => operation.file === '.contextbook/project/concepts.json' && operation.operation === 'skip-manual-review' && operation.supported === false), 'memory repair dry-run did not block invalid project json');
  const invalidConceptsRebuild = JSON.parse(run(['memory', 'rebuild', '--dry-run', '--json']));
  assert(invalidConceptsRebuild.status === 'blocked' && invalidConceptsRebuild.operations.some((operation) => operation.operation === 'skip-validation-blocked' && operation.files.includes('.contextbook/project/concepts.json')), 'memory rebuild dry-run did not block invalid project json');
  const invalidConceptsRecover = JSON.parse(run(['memory', 'recover', '--json']));
  assert(invalidConceptsRecover.status === 'blocked' && (invalidConceptsRecover.primaryCase === 'restore-candidate' || invalidConceptsRecover.primaryCase === 'malformed-memory' || invalidConceptsRecover.primaryCase === 'mixed'), 'memory recover should block malformed project json');
  assert(invalidConceptsRecover.recommendedFlow.some((step) => step.command.includes('memory restore') || step.reason.includes('malformed')), 'memory recover malformed json missing restore/manual guidance');
  assert(!JSON.stringify(invalidConceptsRecover).includes('{ invalid json'), 'memory recover leaked raw malformed json');
  const invalidConceptsSafeRecover = JSON.parse(run(['memory', 'recover', '--safe', '--json']));
  assert(invalidConceptsSafeRecover.mode === 'safe' && invalidConceptsSafeRecover.appliedActions.length === 0, 'memory recover safe should not apply malformed project json');
  assert(invalidConceptsSafeRecover.blockedActions.some((action) => action.kind === 'restore' || action.kind === 'manual-review'), 'memory recover safe malformed json missing blocked restore/manual action');
  assert(invalidConceptsSafeRecover.safety.projectMemoryMutated === false && invalidConceptsSafeRecover.safety.learnerMemoryMutated === false, 'memory recover safe malformed json mutated memory');
  assert(!JSON.stringify(invalidConceptsSafeRecover).includes('{ invalid json'), 'memory recover safe leaked raw malformed json');
  await writeFile(join(root, '.contextbook', 'project', 'concepts.json'), conceptsBeforeCorrupt, 'utf8');
  const scanRunsBeforeCorrupt = await readFile(join(root, '.contextbook', 'project', 'scan-runs.jsonl'), 'utf8');
  await writeFile(join(root, '.contextbook', 'project', 'scan-runs.jsonl'), `${scanRunsBeforeCorrupt}{"schemaVersion":1,"notScannedAt":true}
`, 'utf8');
  const invalidScanRunsValidate = JSON.parse(run(['memory', 'validate', '--json']));
  assert(invalidScanRunsValidate.status === 'error' && invalidScanRunsValidate.issues.some((issue) => issue.file === '.contextbook/project/scan-runs.jsonl' && issue.code === 'invalid-shape'), 'memory validate did not catch malformed scan-run object');
  const invalidScanRunsRebuild = JSON.parse(run(['memory', 'rebuild', '--dry-run', '--json']));
  assert(invalidScanRunsRebuild.status === 'blocked' && invalidScanRunsRebuild.operations.some((operation) => operation.operation === 'skip-validation-blocked' && operation.files.includes('.contextbook/project/scan-runs.jsonl')), 'memory rebuild dry-run did not block malformed scan-run object');
  await writeFile(join(root, '.contextbook', 'project', 'scan-runs.jsonl'), scanRunsBeforeCorrupt, 'utf8');
  const signalsBeforeCorrupt = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const rawBadLine = '{\"rawSecret\":\"should-not-leak\"';
  await writeFile(join(learnerDir, 'signals.jsonl'), `${signalsBeforeCorrupt}${rawBadLine}\n`, 'utf8');
  const invalidSignalsValidate = JSON.parse(run(['memory', 'validate', '--json']));
  assert(invalidSignalsValidate.status === 'error' && invalidSignalsValidate.issues.some((issue) => issue.file === '~/.contextbook/learners/default/signals.jsonl' && issue.code === 'invalid-jsonl' && typeof issue.line === 'number'), 'memory validate did not catch invalid learner jsonl line');
  assert(!JSON.stringify(invalidSignalsValidate).includes('should-not-leak'), 'memory validate leaked raw invalid jsonl content');
  const invalidSignalsRepair = JSON.parse(run(['memory', 'repair', '--dry-run', '--json']));
  assert(invalidSignalsRepair.status === 'blocked' && invalidSignalsRepair.operations.some((operation) => operation.file === '~/.contextbook/learners/default/signals.jsonl' && operation.operation === 'skip-manual-review' && typeof operation.line === 'number'), 'memory repair dry-run did not block invalid learner jsonl');
  assert(!JSON.stringify(invalidSignalsRepair).includes('should-not-leak'), 'memory repair dry-run leaked raw invalid jsonl content');
  const invalidSignalsRebuild = JSON.parse(run(['memory', 'rebuild', '--dry-run', '--json']));
  assert(invalidSignalsRebuild.status === 'blocked' && invalidSignalsRebuild.operations.some((operation) => operation.operation === 'skip-validation-blocked' && operation.files.includes('~/.contextbook/learners/default/signals.jsonl')), 'memory rebuild dry-run did not block invalid learner jsonl');
  assert(!JSON.stringify(invalidSignalsRebuild).includes('should-not-leak'), 'memory rebuild dry-run leaked raw invalid jsonl content');
  const invalidSignalsBackup = JSON.parse(run(['memory', 'backup', '--dry-run', '--json']));
  assert(invalidSignalsBackup.status === 'ok' && invalidSignalsBackup.manifest.items.some((item) => item.file === '~/.contextbook/learners/default/signals.jsonl' && item.include === true), 'memory backup dry-run should still preview corrupt signals file metadata');
  assert(!JSON.stringify(invalidSignalsBackup).includes('should-not-leak'), 'memory backup dry-run leaked raw invalid jsonl content');
  await writeFile(join(learnerDir, 'signals.jsonl'), signalsBeforeCorrupt, 'utf8');

  await writeFile(join(root, 'README.md'), '# Smoke project\n\nChanged after scan.\n', 'utf8');
  const staleMemoryContext = JSON.parse(run(['memory', 'context', '--json']));
  assert(staleMemoryContext.freshness.workingTreeChanged === true, 'memory context should report stale working tree after post-scan edit');
  assert(staleMemoryContext.freshness.changedFilesSinceScan >= 1, 'memory context should report changed file count after post-scan edit');
  assert(staleMemoryContext.freshness.staleHints.some((hint) => hint.code === 'working-tree-changed' && hint.recommendedCommand === 'contextbook scan'), 'memory context missing working-tree stale hint');
  assert(staleMemoryContext.recommendedActions.some((action) => action.command === 'contextbook scan' && action.source === 'freshness'), 'memory context missing scan recommendation for stale project');
  const staleDoctor = JSON.parse(run(['doctor', '--json']));
  assert(staleDoctor.project.freshness.workingTreeChanged === true && staleDoctor.project.freshness.staleReasons.includes('working-tree-changed'), 'doctor should report stale project freshness after post-scan edit');
  assert(staleDoctor.nextActions.some((action) => action.command === 'contextbook scan'), 'doctor missing scan action for stale project');
  const staleRecover = JSON.parse(run(['memory', 'recover', '--json']));
  assert(staleRecover.findings.some((finding) => finding.code === 'stale-project-memory'), 'memory recover should find stale project memory');
  assert(staleRecover.recommendedFlow.some((step) => step.command === 'contextbook memory rebuild --dry-run'), 'memory recover missing rebuild dry-run for stale project');
  assert(staleRecover.recommendedFlow.some((step) => step.command === 'contextbook memory rebuild --yes' && step.requiresYes === true), 'memory recover missing rebuild yes for stale project');
  const mixedPreferenceApply = JSON.parse(run(['memory', 'apply-preference-signals', '--prompt', '앞으로 영어로 짧게 설명해줘.', '--source', 'manual', '--json']));
  assert(mixedPreferenceApply.applied === true || mixedPreferenceApply.changes.some((change) => change.operation === 'skip-identical'), 'mixed preference setup did not produce a valid preference apply result');
  const staleSafeRecover = JSON.parse(run(['memory', 'recover', '--safe', '--json']));
  assert(staleSafeRecover.appliedActions.some((action) => action.kind === 'rebuild'), 'memory recover safe should apply rebuild for stale project memory');
  assert(staleSafeRecover.blockedActions.some((action) => action.kind === 'preference-undo'), 'memory recover safe should leave preference undo explicit in mixed case');
  assert(staleSafeRecover.safety.projectMemoryMutated === true && staleSafeRecover.safety.conversationMemoryMutated === false, 'memory recover safe stale safety flags invalid');
  assert(staleSafeRecover.postValidationStatus !== 'error', 'memory recover safe stale should not leave validation error');

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
  const codexLearnSkill = join(home, '.codex', 'skills', 'learn', 'SKILL.md');
  const codexWhySkill = join(home, '.codex', 'skills', 'why', 'SKILL.md');
  const codexLegacySkill = join(home, '.agents', 'skills', 'contextbook', 'SKILL.md');
  const codexLegacyLearnSkill = join(home, '.agents', 'skills', 'learn', 'SKILL.md');
  const codexLegacyWhySkill = join(home, '.agents', 'skills', 'why', 'SKILL.md');
  const claudeSkill = join(home, '.claude', 'skills', 'contextbook', 'SKILL.md');
  const claudeShortLearn = join(home, '.claude', 'commands', 'learn.md');
  const claudeShortWhy = join(home, '.claude', 'commands', 'why.md');
  const codexHookScript = join(home, '.codex', 'hooks', 'contextbook-user-prompt-submit.js');
  const codexHookGuide = join(home, '.codex', 'hooks', 'contextbook-user-prompt-submit.md');
  const claudeHookScript = join(home, '.claude', 'hooks', 'contextbook-user-prompt-submit.js');
  const claudeHookGuide = join(home, '.claude', 'hooks', 'contextbook-user-prompt-submit.md');

  const signalsBeforeDoctor = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const evidenceBeforeDoctor = await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8');
  const doctorAfterScan = JSON.parse(run(['doctor', '--json']));
  assert(doctorAfterScan.project.status === 'scanned' && doctorAfterScan.project.counts.concepts > 0, 'doctor after scan should report scanned project memory');
  assert(doctorAfterScan.learner.status === 'ready' && doctorAfterScan.learner.files.some((file) => file.name === 'signals'), 'doctor after scan should report learner memory files');
  assert(doctorAfterScan.hooks.status === 'missing', 'doctor before hook setup should report missing hooks');
  assert(doctorAfterScan.nextActions.some((action) => action.command === 'contextbook setup'), 'doctor should recommend hook setup before helpers exist');
  assert((await readFile(join(learnerDir, 'signals.jsonl'), 'utf8')) === signalsBeforeDoctor, 'doctor should not mutate learner signals');
  assert((await readFile(join(root, '.contextbook', 'project', 'evidence.jsonl'), 'utf8')) === evidenceBeforeDoctor, 'doctor should not mutate project evidence');

  const hooksStatusBefore = run(['hooks', 'status']);
  assert(hooksStatusBefore.includes('# Contextbook Hooks Status'), 'hooks status missing heading');
  assert(hooksStatusBefore.includes('helper script: missing'), 'hooks status before setup should show missing helpers');
  assert(hooksStatusBefore.includes('contextbook setup'), 'hooks status before setup missing setup action');
  const hooksStatusJsonBefore = JSON.parse(run(['hooks', 'status', '--json']));
  assert(hooksStatusJsonBefore.schemaVersion === 1, 'hooks status json missing schema version');
  assert(hooksStatusJsonBefore.overallHealth.status === 'missing', 'hooks status before setup should expose missing overall health');
  assert(hooksStatusJsonBefore.safety.readOnly === true && hooksStatusJsonBefore.safety.configMutated === false, 'hooks status safety flags invalid');
  assert(hooksStatusJsonBefore.platforms.length === 2, 'hooks status json should include both platforms');
  assert(hooksStatusJsonBefore.platforms.every((platform) => platform.health.status === 'missing' && platform.health.issues.some((issue) => issue.code === 'HOOK_HELPER_MISSING')), 'hooks status before setup should expose helper missing issue codes');
  const hooksSmokeMissing = JSON.parse(run(['hooks', 'smoke', '--prompt', 'cleanup 왜 해야 돼?', '--json']));
  assert(hooksSmokeMissing.schemaVersion === 1 && hooksSmokeMissing.platforms.length === 2, 'hooks smoke missing json contract');
  assert(hooksSmokeMissing.status === 'missing' && hooksSmokeMissing.expectedOutputShape === 'platform-specific-additional-context' && hooksSmokeMissing.outputShapeValid === false, 'hooks smoke missing should expose top-level health contract');
  assert(hooksSmokeMissing.safety.readOnly === true && hooksSmokeMissing.safety.learnerMemoryMutated === false, 'hooks smoke missing read-only safety contract');
  assert(hooksSmokeMissing.platforms.every((platform) => platform.ran === false && platform.helper.exists === false), 'hooks smoke before setup should not run missing helpers');
  assert(runExpectFail(['hooks', 'smoke', '--prompt', 'x', '--platform', 'cursor']).includes('Usage:'), 'hooks smoke invalid platform should fail with usage');

  const setupDryRun = run(['setup', '--dry-run']);
  assert(setupDryRun.includes('# Contextbook setup (dry run)'), 'setup dry-run did not show setup heading');
  assert(setupDryRun.includes('# Contextbook codex install (dry run)') && setupDryRun.includes('# Contextbook claude-code install (dry run)'), 'setup dry-run did not preview both adapters');
  assert(setupDryRun.includes('.codex') && setupDryRun.includes('.claude'), 'setup dry-run did not show codex and claude target paths');
  assert(setupDryRun.includes('.codex/hooks') && setupDryRun.includes('.claude/hooks') && setupDryRun.includes('safe preference automation'), 'setup dry-run did not preview default hook/safe preference setup');
  assert(setupDryRun.includes('.claude/commands/learn.md') && setupDryRun.includes('.claude/commands/why.md'), 'setup dry-run did not preview short Claude aliases');
  assert(setupDryRun.includes('.codex/skills/learn/SKILL.md') && setupDryRun.includes('.codex/skills/why/SKILL.md'), 'setup dry-run did not preview short Codex aliases');
  assert(!setupDryRun.includes('.codex/skills/contextbook-learn/SKILL.md') && !setupDryRun.includes('.codex/skills/contextbook-why/SKILL.md'), 'setup dry-run should not preview Codex namespaced per-command fallbacks');
  assert(!setupDryRun.includes('.claude/commands/contextbook-learn.md') && !setupDryRun.includes('.claude/commands/contextbook-why.md'), 'setup dry-run should not preview long Claude per-command aliases');
  const setupAutoDryRun = run(['setup', '--auto', '--dry-run']);
  assert(setupAutoDryRun.includes('auto/bootstrap') && setupAutoDryRun.includes('non-interactive') && setupAutoDryRun.includes('.codex/hooks'), 'setup --auto dry-run did not show bootstrap hook setup');
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
  for (const fragment of [
    '.codex/skills/contextbook/SKILL.md',
    '.codex/skills/learn/SKILL.md',
    '.codex/skills/why/SKILL.md',
    '.agents/skills/contextbook/SKILL.md',
    '.agents/skills/learn/SKILL.md',
    '.agents/skills/why/SKILL.md',
  ]) {
    assert(codexBothDryRun.includes(fragment), `codex both dry-run missing ${fragment}`);
  }
  assert(!existsSync(codexSkill) && !existsSync(codexLegacySkill), 'codex both dry-run wrote a file');
  const legacyAutoHome = join(home, 'legacy-auto-home');
  await mkdir(join(legacyAutoHome, '.codex', 'skills'), { recursive: true });
  assert(core.codexFiles(legacyAutoHome)[0].path.includes('.codex'), 'codex auto mode did not default to canonical .codex skills path');
  const claudeDryRun = run(['install', 'claude-code', '--dry-run']);
  assert(claudeDryRun.includes('would create'), 'claude dry-run did not preview create');
  assert(!existsSync(claudeSkill) && !existsSync(claudeShortLearn) && !existsSync(claudeShortWhy), 'claude dry-run wrote files');

  await seedDeprecatedAliases(home);
  await seedDeprecatedAliases(home, '.agents');
  await seedDeprecatedClaudeAliases(home);
  const setupInstall = run(['setup']);
  assert(setupInstall.includes('# Contextbook setup') && setupInstall.includes('created'), 'setup did not install helper files');
  assert(setupInstall.includes('removed deprecated Contextbook alias'), 'setup should remove generated deprecated long aliases during upgrade');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook learn'), 'setup codex skill missing learn guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook project --json'), 'setup codex skill missing project json guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook learner --json'), 'setup codex skill missing learner json guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory context --json'), 'setup codex skill missing memory context guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory add-signal'), 'setup codex skill missing memory signal guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory capture-prompt'), 'setup codex skill missing prompt capture guidance');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook memory hook-suggest'), 'setup codex skill missing hook suggest guidance');
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
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory hook-suggest'), 'setup claude skill missing hook suggest guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory suggest-weak-terms --json'), 'setup claude skill missing weak suggestion guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory suggest-profile-updates --json'), 'setup claude skill missing profile suggestion guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory apply-profile-update --candidate <id|index> --dry-run'), 'setup claude skill missing profile apply dry-run guidance');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook memory apply-preference-signals --prompt'), 'setup claude skill missing preference apply dry-run guidance');
  assert(existsSync(codexLearnSkill) && existsSync(codexWhySkill), 'setup missing short Codex aliases');
  assert((await readFile(codexLearnSkill, 'utf8')).includes('Contextbook managed alias') && (await readFile(codexLearnSkill, 'utf8')).includes('contextbook learn'), 'codex learn alias missing marker or CLI guidance');
  assert((await readFile(codexWhySkill, 'utf8')).includes('Contextbook managed alias') && (await readFile(codexWhySkill, 'utf8')).includes('contextbook why "<question>"'), 'codex why alias missing marker or CLI guidance');
  assert(!existsSync(join(home, '.codex', 'skills', 'contextbook-learn', 'SKILL.md')) && !existsSync(join(home, '.codex', 'skills', 'contextbook-why', 'SKILL.md')), 'setup should not install Codex namespaced per-command fallbacks');
  assert(!existsSync(join(home, '.agents', 'skills', 'contextbook-learn', 'SKILL.md')) && !existsSync(join(home, '.agents', 'skills', 'contextbook-why', 'SKILL.md')), 'setup should remove historical .agents namespaced per-command fallbacks');
  assert(!existsSync(join(home, '.claude', 'commands', 'contextbook-learn.md')) && !existsSync(join(home, '.claude', 'commands', 'contextbook-why.md')), 'setup should not install long Claude per-command aliases');
  assert(existsSync(claudeShortLearn) && existsSync(claudeShortWhy), 'setup missing short Claude aliases');
  assert((await readFile(claudeShortLearn, 'utf8')).includes('Contextbook managed alias') && (await readFile(claudeShortLearn, 'utf8')).includes('contextbook learn'), 'claude short learn alias missing marker or CLI guidance');
  assert((await readFile(claudeShortWhy, 'utf8')).includes('Contextbook managed alias') && (await readFile(claudeShortWhy, 'utf8')).includes('$ARGUMENTS') && (await readFile(claudeShortWhy, 'utf8')).includes('contextbook why'), 'claude short why alias missing marker/arguments/CLI guidance');
  assert(existsSync(codexHookScript) && existsSync(claudeHookScript), 'default setup should install hook files');

  const setupHooksInstall = run(['setup', '--hooks']);
  assert(setupHooksInstall.includes('skipped identical') && setupHooksInstall.includes('included by default'), 'setup --hooks compatibility path did not reinstall/skip hook helpers');
  const codexHookScriptText = await readFile(codexHookScript, 'utf8');
  const codexHookGuideText = await readFile(codexHookGuide, 'utf8');
  const claudeHookScriptText = await readFile(claudeHookScript, 'utf8');
  const claudeHookGuideText = await readFile(claudeHookGuide, 'utf8');
  for (const [label, text, source] of [['codex', codexHookScriptText, 'codex'], ['claude', claudeHookScriptText, 'claude-code']]) {
    assert(text.includes('spawnSync') && text.includes('memory') && text.includes('hook-suggest'), `${label} hook script missing hook-suggest spawn`);
    assert(text.includes(`'${source}'`), `${label} hook script missing source`);
    assert(text.includes('additionalContext'), `${label} hook script missing suggestion bridge output`);
    assert(text.includes('AUTO_SAFE_PREFERENCES = true') && text.includes('auto-safe') && text.includes('apply-preference-signals'), `${label} setup hook script missing auto-safe preference bridge`);
    assert(text.includes('CONTEXTBOOK_HOOK_SMOKE') && text.includes('--no-capture'), `${label} hook script missing smoke no-capture guard`);
    assert(!text.includes('transcript_path'), `${label} hook script should not parse transcript path`);
  }
  assert(codexHookGuideText.includes('~/.codex/hooks.json') && codexHookGuideText.includes('UserPromptSubmit') && codexHookGuideText.includes('review and trust'), 'codex hook guide missing config/trust guidance');
  assert(claudeHookGuideText.includes('~/.claude/settings.json') && claudeHookGuideText.includes('UserPromptSubmit'), 'claude hook guide missing config guidance');
  const doctorAfterHooks = JSON.parse(run(['doctor', '--json']));
  assert(doctorAfterHooks.hooks.status === 'helpers-installed' && doctorAfterHooks.hooks.overallHealth.status === 'installed-not-configured' && doctorAfterHooks.nextActions.some((action) => action.command.includes('hooks smoke')), 'doctor after hook setup should report helpers and recommend smoke');

  const hooksStatusAfterSetup = JSON.parse(run(['hooks', 'status', '--json']));
  const codexPlatform = hooksStatusAfterSetup.platforms.find((platform) => platform.id === 'codex');
  const claudePlatform = hooksStatusAfterSetup.platforms.find((platform) => platform.id === 'claude-code');
  assert(codexPlatform?.helper.exists === true && claudePlatform?.helper.exists === true, 'hooks status after setup should find helper scripts');
  assert(codexPlatform.helperCurrent === true && claudePlatform.helperCurrent === true, 'hooks status after setup should mark generated helpers current');
  assert(codexPlatform.health.status === 'installed-not-configured' && claudePlatform.health.status === 'installed-not-configured', 'hooks status after setup should expose installed-not-configured health');
  assert(codexPlatform.health.issues.some((issue) => issue.code === 'HOOK_CONFIG_NOT_ENABLED'), 'codex hooks status missing config issue code');
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
  const doctorHooksEnabled = JSON.parse(run(['doctor', '--json']));
  assert(doctorHooksEnabled.hooks.status === 'configured' && doctorHooksEnabled.hooks.overallHealth.status === 'configured-needs-trust', 'doctor should report configured hooks after config snippets exist');

  const hooksStatusEnabled = JSON.parse(run(['hooks', 'status', '--json']));
  const codexEnabled = hooksStatusEnabled.platforms.find((platform) => platform.id === 'codex');
  const claudeEnabled = hooksStatusEnabled.platforms.find((platform) => platform.id === 'claude-code');
  assert(hooksStatusEnabled.overallHealth.status === 'configured-needs-trust', 'hooks status enabled should expose configured-needs-trust health');
  assert(codexEnabled.health.status === 'configured-needs-trust' && claudeEnabled.health.status === 'configured-needs-trust', 'enabled platform health should require trust/smoke review');
  assert(codexEnabled.health.issues.some((issue) => issue.code === 'HOOK_TRUST_REVIEW_NEEDED'), 'enabled platform health missing trust review issue');
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
  const hookBinDir = join(home, 'bin');
  await mkdir(hookBinDir, { recursive: true });
  const hookBin = join(hookBinDir, 'contextbook');
  await writeFile(hookBin, `#!/bin/sh
HOME=${JSON.stringify(home)} USERPROFILE=${JSON.stringify(home)} ${JSON.stringify(process.execPath)} ${JSON.stringify(cli)} "$@"
`, 'utf8');
  await chmod(hookBin, 0o755);
  const hookEnv = { ...process.env, PATH: `${hookBinDir}:${process.env.PATH ?? ''}`, HOME: home, USERPROFILE: home };
  const signalsBeforeHooksSmoke = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  const hooksSmoke = JSON.parse(run(['hooks', 'smoke', '--prompt', '뭔소리야 너무 추상적임', '--json'], { env: { ...hookEnv, EDITOR: '' } }));
  const smokeCodex = hooksSmoke.platforms.find((platform) => platform.id === 'codex');
  const smokeClaude = hooksSmoke.platforms.find((platform) => platform.id === 'claude-code');
  assert(hooksSmoke.status === 'live-smoke-ok' && hooksSmoke.outputShapeValid === true && hooksSmoke.helperCurrent === true, 'hooks smoke should expose live-smoke-ok top-level health');
  assert(hooksSmoke.safety.learnerMemoryMutated === false && hooksSmoke.safety.rawPromptPersisted === false, 'hooks smoke must declare no learner/raw prompt mutation');
  assert(smokeCodex?.ran === true && smokeCodex.status === 'live-smoke-ok' && smokeCodex.expectedOutputShape === 'plain-context' && smokeCodex.outputKind === 'plain-context' && smokeCodex.outputShapeValid === true && smokeCodex.additionalContextDetected === true, 'codex hooks smoke should detect plain additional context');
  assert(smokeClaude?.ran === true && smokeClaude.status === 'live-smoke-ok' && smokeClaude.expectedOutputShape === 'json-additional-context' && smokeClaude.outputKind === 'json-additional-context' && smokeClaude.outputShapeValid === true && smokeClaude.additionalContextDetected === true, 'claude hooks smoke should detect json additional context');
  assert(smokeCodex.rawPromptDetected === false && smokeClaude.rawPromptDetected === false, 'hooks smoke should not expose raw prompt in helper output');
  const hooksSmokeCodexOnly = JSON.parse(run(['hooks', 'smoke', '--prompt', 'cleanup 왜 해야 돼?', '--platform', 'codex', '--json'], { env: { ...hookEnv, EDITOR: '' } }));
  assert(hooksSmokeCodexOnly.platform === 'codex' && hooksSmokeCodexOnly.platforms.length === 1 && hooksSmokeCodexOnly.platforms[0].id === 'codex', 'hooks smoke platform filter failed');
  const hooksSmokePreference = JSON.parse(run(['hooks', 'smoke', '--prompt', '앞으로 한국어로 짧게 설명해줘', '--json'], { env: { ...hookEnv, EDITOR: '' } }));
  assert(hooksSmokePreference.safePreferencePreview.wouldApply === true, 'hooks smoke should expose top-level safe preference preview');
  assert(hooksSmokePreference.safety.preferencesMutated === false && hooksSmokePreference.platforms.every((platform) => platform.safePreferencePreview.wouldApply === true && platform.autoSafePreferenceSectionDetected === true && platform.wouldApplyPreferences === true), 'hooks smoke should preview auto-safe preference updates without mutating preferences');
  const signalsAfterHooksSmoke = await readFile(join(learnerDir, 'signals.jsonl'), 'utf8');
  assert(signalsAfterHooksSmoke === signalsBeforeHooksSmoke, 'hooks smoke should not mutate conversation memory even for feedback-like prompts');
  const codexHookNoSignalRun = spawnSync(process.execPath, [codexHookScript], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'PR 머지해줘' }),
    cwd: root,
    env: hookEnv,
    encoding: 'utf8'
  });
  assert(codexHookNoSignalRun.status === 0 && codexHookNoSignalRun.stdout.trim() === '', 'codex hook should stay silent without actionable signal');
  const codexHookSuggestRun = spawnSync(process.execPath, [codexHookScript], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '앞으로 한국어로 짧게 설명해줘' }),
    cwd: root,
    env: hookEnv,
    encoding: 'utf8'
  });
  assert(codexHookSuggestRun.status === 0 && codexHookSuggestRun.stdout.includes('# Contextbook Hook Suggestion'), 'codex hook did not print suggestion context');
  assert(codexHookSuggestRun.stdout.includes('## Auto-safe Preference Update'), 'codex hook did not append auto-safe preference update context');
  assert(!codexHookSuggestRun.stdout.includes('앞으로 한국어로 짧게 설명해줘'), 'codex hook leaked raw prompt');
  const claudeHookSuggestRun = spawnSync(process.execPath, [claudeHookScript], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '앞으로 한국어로 짧게 설명해줘' }),
    cwd: root,
    env: hookEnv,
    encoding: 'utf8'
  });
  assert(claudeHookSuggestRun.status === 0, 'claude hook suggestion run failed');
  const claudeHookOutput = JSON.parse(claudeHookSuggestRun.stdout);
  assert(claudeHookOutput.hookSpecificOutput?.additionalContext?.includes('# Contextbook Hook Suggestion'), 'claude hook did not print additionalContext JSON');
  assert(claudeHookOutput.hookSpecificOutput.additionalContext.includes('## Auto-safe Preference Update'), 'claude hook did not append auto-safe preference update context');
  assert(!claudeHookOutput.hookSpecificOutput.additionalContext.includes('앞으로 한국어로 짧게 설명해줘'), 'claude hook leaked raw prompt');
  await writeFile(codexHookScript, '#!/usr/bin/env node\nconsole.log(\"custom\");\n', 'utf8');
  const tamperedStatus = JSON.parse(run(['hooks', 'status', '--json']));
  const tamperedCodex = tamperedStatus.platforms.find((platform) => platform.id === 'codex');
  assert(tamperedStatus.overallHealth.status === 'stale-helper', 'hooks status should surface stale helper overall health');
  assert(tamperedCodex.runtime.helperSmoke === 'skipped' && tamperedCodex.helperCurrent === false && tamperedCodex.health.status === 'stale-helper', 'hooks status should not execute modified helper scripts');
  assert(tamperedCodex.health.issues.some((issue) => issue.code === 'HOOK_HELPER_STALE'), 'tampered hook missing stale helper issue code');
  const tamperedSmoke = JSON.parse(run(['hooks', 'smoke', '--prompt', 'cleanup 왜 해야 돼?', '--platform', 'codex', '--json']));
  assert(tamperedSmoke.status === 'stale-helper' && tamperedSmoke.platforms[0].ran === false && tamperedSmoke.platforms[0].health.issues.some((issue) => issue.code === 'HOOK_HELPER_STALE'), 'hooks smoke should not execute stale helpers');
  const restoredCodexHook = run(['install', 'codex', '--hooks']);
  assert(restoredCodexHook.includes('updated with backup'), 'codex hook script restore should back up modified helper');

  const setupHooksAgain = run(['setup', '--hooks']);
  assert(setupHooksAgain.includes('skipped identical') && setupHooksAgain.includes('included by default'), 'setup --hooks reinstall did not skip identical files');

  const codexInstall = run(['install', 'codex']);
  assert(codexInstall.includes('skipped identical'), 'codex install after setup did not skip identical file');
  assert(existsSync(codexHookScript), 'codex install without --hooks should not remove existing hook file');
  assert((await readFile(codexSkill, 'utf8')).includes('contextbook learn'), 'codex skill missing learn guidance');
  const codexInstallAgain = run(['install', 'codex']);
  assert(codexInstallAgain.includes('skipped identical'), 'codex reinstall did not skip identical file');
  await seedDeprecatedAliases(home, '.agents');
  const codexLegacyInstall = run(['install', 'codex', '--codex-path', 'agents']);
  assert(codexLegacyInstall.includes('created'), 'codex explicit historical agents install did not create compatibility file');
  assert(codexLegacyInstall.includes('removed deprecated Contextbook alias'), 'codex historical agents install should remove generated deprecated namespaced aliases');
  assert((await readFile(codexLegacySkill, 'utf8')).includes('contextbook learn'), 'codex legacy skill missing learn guidance');
  assert((await readFile(codexLegacyLearnSkill, 'utf8')).includes('contextbook learn'), 'codex legacy learn alias missing guidance');
  assert((await readFile(codexLegacyWhySkill, 'utf8')).includes('contextbook why'), 'codex legacy why alias missing guidance');

  const claudeInstall = run(['install', 'claude-code']);
  assert(claudeInstall.includes('skipped identical'), 'claude install after setup did not skip identical files');
  assert(existsSync(claudeHookScript), 'claude install without --hooks should not remove existing hook file');
  assert((await readFile(claudeSkill, 'utf8')).includes('contextbook why'), 'claude skill missing why guidance');
  assert((await readFile(claudeShortLearn, 'utf8')).includes('contextbook learn'), 'claude short learn command missing CLI guidance');
  assert((await readFile(claudeShortLearn, 'utf8')).includes('contextbook memory context --json'), 'claude short learn command missing memory context guidance');
  assert((await readFile(claudeShortLearn, 'utf8')).includes('contextbook memory apply-profile-update --candidate <id|index> --dry-run'), 'claude short learn command missing profile apply dry-run guidance');
  assert((await readFile(claudeShortWhy, 'utf8')).includes('$ARGUMENTS'), 'claude short why command missing argument placeholder');

  await writeFile(codexHookGuide, 'custom codex hook guide\n', 'utf8');
  const codexHookUpdate = run(['install', 'codex', '--hooks']);
  assert(codexHookUpdate.includes('updated with backup'), 'codex changed hook guide was not backed up before update');
  const codexHookDirEntries = await readdir(join(home, '.codex', 'hooks'));
  assert(codexHookDirEntries.some((entry) => entry.startsWith('contextbook-user-prompt-submit.md.bak-')), 'backup file missing for changed codex hook guide');

  await writeFile(claudeShortLearn, 'custom user learn command\n', 'utf8');
  const claudeCollision = run(['install', 'claude-code']);
  assert(claudeCollision.includes('skipped existing unmanaged file') && (await readFile(claudeShortLearn, 'utf8')) === 'custom user learn command\n', 'claude short alias collision should skip without overwrite');
  await writeFile(codexLearnSkill, 'custom user learn skill mentioning Contextbook managed alias as prose\n', 'utf8');
  const codexCollision = run(['install', 'codex']);
  assert(codexCollision.includes('skipped existing unmanaged file') && (await readFile(codexLearnSkill, 'utf8')) === 'custom user learn skill mentioning Contextbook managed alias as prose\n', 'codex short alias false-positive marker prose should skip without overwrite');
  await writeFile(claudeShortWhy, 'custom user why command mentioning Contextbook managed alias as prose\n', 'utf8');
  const claudeMarkerCollision = run(['install', 'claude-code']);
  assert(claudeMarkerCollision.includes('skipped existing unmanaged file') && (await readFile(claudeShortWhy, 'utf8')) === 'custom user why command mentioning Contextbook managed alias as prose\n', 'claude short alias false-positive marker prose should skip without overwrite');

  await mkdir(join(home, '.codex', 'skills', 'contextbook-why'), { recursive: true });
  await writeFile(join(home, '.codex', 'skills', 'contextbook-why', 'SKILL.md'), 'custom user long alias\n', 'utf8');
  const unmanagedDeprecatedAlias = run(['install', 'codex']);
  assert(unmanagedDeprecatedAlias.includes('kept unmanaged deprecated alias') && (await readFile(join(home, '.codex', 'skills', 'contextbook-why', 'SKILL.md'), 'utf8')) === 'custom user long alias\n', 'unmanaged deprecated long alias should be preserved');

  await writeFile(codexWhySkill, '<!-- Contextbook managed alias: why -->\ncustom managed why skill\n', 'utf8');
  const codexManagedAliasUpdate = run(['install', 'codex']);
  assert(codexManagedAliasUpdate.includes('updated with backup'), 'managed codex short alias was not backed up before update');
  const codexWhyAliasEntries = await readdir(join(home, '.codex', 'skills', 'why'));
  assert(codexWhyAliasEntries.some((entry) => entry.startsWith('SKILL.md.bak-')), 'backup file missing for managed codex short alias');

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
