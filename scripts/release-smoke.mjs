import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const tempRoot = await mkdtemp(join(tmpdir(), 'contextbook-release-smoke-'));
const home = join(tempRoot, 'home');
const project = join(tempRoot, 'project');
const npmPrefix = join(tempRoot, 'npm-global');
const binDir = join(npmPrefix, 'bin');
const prompt = 'cleanup 왜 해야 돼?';

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  tempRoot,
  checks: [],
  safety: {
    tempHome: true,
    tempProject: true,
    npmPublish: false,
    cleanupAttempted: false
  }
};

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

Preserve the evidence level, project-language explanation, CS connection, interview sentence, and evidence files. If Contextbook says evidence is \`general\`, do not imply the concept was found directly in the project.
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
4. Preserve the evidence level, project-language explanation, CS connection, interview sentence, and evidence files.
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

function record(name, result, extra = {}) {
  const ok = result.status === 0;
  report.checks.push({
    name,
    ok,
    status: result.status,
    command: result.command,
    stdoutPreview: preview(result.stdout),
    stderrPreview: preview(result.stderr),
    ...extra
  });
  if (!ok) {
    throw new Error(`${name} failed: ${result.command}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function contextbook(args, options = {}) {
  return run('contextbook', args, {
    cwd: options.cwd ?? project,
    env: releaseEnv(),
    timeout: options.timeout ?? 120_000
  });
}

function releaseEnv() {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    EDITOR: ''
  };
}

function parseJsonCheck(name, stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${name} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}\n${stdout}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function preview(value) {
  const trimmed = value.trim();
  return trimmed.length <= 800 ? trimmed : `${trimmed.slice(0, 800)}…`;
}

try {
  await mkdir(home, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0' } }, null, 2), 'utf8');
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, 'src', 'useWorkflowSSE.ts'), 'export const source = new EventSource("/events");\n', 'utf8');

  record('npm-test', run('npm', ['test'], { timeout: 180_000 }));
  record('git-diff-check', run('git', ['diff', '--check']));
  const packDryRun = record('npm-pack-dry-run', run('npm', ['pack', '--dry-run']));
  assert(packDryRun.includes('contextbook-0.1.0.tgz'), 'npm pack --dry-run did not preview contextbook tarball');
  const packOutput = record('npm-pack', run('npm', ['pack']));
  const tarball = packOutput.trim().split(/\r?\n/).filter(Boolean).at(-1);
  assert(tarball && tarball.endsWith('.tgz'), `npm pack did not print a tarball name: ${packOutput}`);
  const tarballPath = join(repoRoot, tarball);
  assert(existsSync(tarballPath), `tarball not found: ${tarballPath}`);

  record('npm-install-global-from-tarball', run('npm', ['install', '-g', tarballPath, '--prefix', npmPrefix], { timeout: 180_000 }));
  record('contextbook-help', contextbook(['--help']));
  await seedDeprecatedAliases(home);
  await seedDeprecatedAliases(home, '.agents');
  await seedDeprecatedClaudeAliases(home);
  const setupStdout = record('contextbook-setup-auto', contextbook(['setup', '--auto']));
  assert(setupStdout.includes('removed deprecated Contextbook alias'), 'packaged setup should remove generated deprecated long aliases during upgrade');
  for (const [label, file, expected] of [
    ['codex-contextbook-skill', join(home, '.codex', 'skills', 'contextbook', 'SKILL.md'), 'contextbook learn'],
    ['codex-learn-alias', join(home, '.codex', 'skills', 'learn', 'SKILL.md'), 'Contextbook managed alias'],
    ['codex-why-alias', join(home, '.codex', 'skills', 'why', 'SKILL.md'), 'contextbook why'],
    ['claude-learn-alias', join(home, '.claude', 'commands', 'learn.md'), 'Contextbook managed alias'],
    ['claude-why-alias', join(home, '.claude', 'commands', 'why.md'), '$ARGUMENTS']
  ]) {
    assert(existsSync(file), `${label} missing after packaged setup: ${file}`);
    assert((await readFile(file, 'utf8')).includes(expected), `${label} missing expected content: ${expected}`);
  }

  for (const [label, file] of [
    ['codex-contextbook-learn-removed', join(home, '.codex', 'skills', 'contextbook-learn', 'SKILL.md')],
    ['codex-contextbook-why-removed', join(home, '.codex', 'skills', 'contextbook-why', 'SKILL.md')],
    ['claude-contextbook-learn-removed', join(home, '.claude', 'commands', 'contextbook-learn.md')],
    ['claude-contextbook-why-removed', join(home, '.claude', 'commands', 'contextbook-why.md')]
  ]) {
    assert(!existsSync(file), `${label} should not be installed by simplified setup: ${file}`);
  }

  const statusStdout = record('hooks-status-json', contextbook(['hooks', 'status', '--json']));
  const status = parseJsonCheck('hooks status', statusStdout);
  assert(status.schemaVersion === 1, 'hooks status missing schemaVersion');
  assert(status.overallHealth?.status === 'installed-not-configured', `expected installed-not-configured after setup, got ${status.overallHealth?.status}`);
  assert(status.platforms?.length === 2, 'hooks status should include Codex and Claude Code');
  assert(status.platforms.every((platform) => platform.helper?.exists === true), 'setup should install both hook helpers');
  assert(status.platforms.every((platform) => platform.helperCurrent === true), 'installed hook helpers should be current');

  const smokeStdout = record('hooks-smoke-json', contextbook(['hooks', 'smoke', '--prompt', prompt, '--json']));
  const smoke = parseJsonCheck('hooks smoke', smokeStdout);
  assert(smoke.status === 'live-smoke-ok', `expected live-smoke-ok smoke, got ${smoke.status}`);
  assert(smoke.outputShapeValid === true, 'hooks smoke outputShapeValid should be true');
  assert(smoke.helperCurrent === true, 'hooks smoke helperCurrent should be true');
  assert(smoke.safety?.learnerMemoryMutated === false && smoke.safety?.rawPromptPersisted === false, 'hooks smoke must be read-only for learner/raw prompt safety');
  assert(smoke.platforms.every((platform) => platform.rawPromptDetected === false), 'hooks smoke leaked raw prompt');

  const doctorStdout = record('doctor-json', contextbook(['doctor', '--json']));
  const doctor = parseJsonCheck('doctor', doctorStdout);
  assert(doctor.schemaVersion === 1, 'doctor missing schemaVersion');
  assert(doctor.hooks?.overallHealth?.status === 'installed-not-configured', `doctor should report installed-not-configured hooks, got ${doctor.hooks?.overallHealth?.status}`);
  assert(doctor.safety?.readOnly === true && doctor.safety?.hookConfigMutated === false, 'doctor safety flags invalid');

  await rm(tarballPath, { force: true });
  report.safety.cleanupAttempted = true;
  await rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, ...report }, null, 2));
  await rm(join(repoRoot, 'contextbook-0.1.0.tgz'), { force: true }).catch(() => undefined);
  await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  process.exit(1);
}
