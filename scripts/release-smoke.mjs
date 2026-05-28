import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
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
  record('contextbook-setup', contextbook(['setup']));

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
